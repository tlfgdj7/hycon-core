import { createCipher } from "crypto"
import levelup = require("levelup")
import { getLogger } from "log4js"
import rocksdb = require("rocksdb")
import { AsyncLock } from "../../common/asyncLock"
import { AnyBlock, Block } from "../../common/block"
import { GenesisBlock } from "../../common/blockGenesis"
import { AnyBlockHeader, BlockHeader } from "../../common/blockHeader"
import { GenesisSignedTx } from "../../common/txGenesisSigned"
import { SignedTx } from "../../common/txSigned"
import { Hash } from "../../util/hash"
import { Difficulty } from "../difficulty"
import { DifficultyAdjuster } from "../difficultyAdjuster"
import { BlockStatus } from "../sync"
import { BlockFile } from "./blockFile"
import { DBBlock } from "./dbblock"

const logger = getLogger("Database")

function uint8ArrayEqual(first: Uint8Array, second: Uint8Array): boolean {
    if (first.length !== second.length) { return false }
    for (let i = 0; i < second.length; i++) {
        if (first[i] !== second[i]) {
            return false
        }
    }
    return true
}
export class DecodeError extends Error {
    public hash: Hash
}

// tslint:disable:max-line-length
// tslint:disable-next-line:max-classes-per-file
export class Database {
    private database: levelup.LevelUp
    private blockFile: BlockFile
    private headerLock: AsyncLock
    private blockLock: AsyncLock
    private fileNumber: number

    constructor(dbPath: string, filePath: string) {
        // TODO: Fix levelup defintions to use abstract leveldown in the constructor
        const rocks: any = rocksdb(dbPath)
        this.database = levelup(rocks)
        this.headerLock = new AsyncLock()
        this.blockLock = new AsyncLock()
        this.blockFile = new BlockFile(filePath)
    }

    public async init(): Promise<void> {
        await this.database.open()
        const fileNumber = await this.getOrInitKey("fileNumber")
        const filePosition = await this.getOrInitKey("filePosition")
        this.fileNumber = +fileNumber
        await this.blockFile.fileInit(this.fileNumber, +filePosition)
    }
    public putDBBlock(hash: Hash, dbBlock: DBBlock) {
        return this.database.put("b" + hash, dbBlock.encode())
    }

    public async putBlock(hash: Hash, block: AnyBlock): Promise<{ current: DBBlock, previous: DBBlock }> {
        // Async problem, block could be inserted twice
        return await this.blockLock.critical<{ current: DBBlock, previous: DBBlock }>(async () => {
            const { current, previous } = await this.putHeader(hash, block.header)
            const { fileNumber, offset, length } = await this.writeBlock(block)
            current.offset = offset
            current.length = length
            current.fileNumber = fileNumber
            await this.database.put("b" + hash, current.encode())
            return { current, previous }
        })
    }

    public async writeBlock(block: AnyBlock) {
        const writeLocation = await this.blockFile.put(block)
        if (this.fileNumber !== writeLocation.fileNumber) {
            this.fileNumber = writeLocation.fileNumber
            await this.database.put("fileNumber", this.fileNumber)
        }
        await this.database.put("filePosition", writeLocation.filePosition)
        return writeLocation
    }

    public async putHeader(hash: Hash, header: AnyBlockHeader): Promise<{ current: DBBlock, previous: DBBlock }> {

        return await this.headerLock.critical<{ current: DBBlock, previous: DBBlock }>(async () => {
            const currentBlock = await this.getDBBlock(hash)
            if (currentBlock) {
                let previousBlock: DBBlock | undefined
                if (header instanceof BlockHeader) {
                    previousBlock = await this.getDBBlock(header.previousHash[0])
                }
                return { current: currentBlock, previous: previousBlock }
            }
            const { current, previous } = await this.makeDBBlock(header)
            await this.database.put("b" + hash, current.encode())
            return { current, previous }
        })
    }

    public async setHashAtHeight(height: number, hash: Hash): Promise<void> {
        await this.database.put(height, hash.toBuffer())
    }

    public async getHashAtHeight(height: number): Promise<Hash> {
        try {
            const hashData = new Uint8Array(await this.database.get(height))
            const hash = new Hash(hashData)
            return hash
        } catch (e) {
            if (e.notFound) { return undefined }
            logger.error(`Fail to getHashAtHeight : ${e}`)
            return Promise.reject(e)
        }
    }

    public async setBlockStatus(hash: Hash, status: BlockStatus): Promise<void> {
        await this.database.put("s" + hash, status)
    }

    public async getBlockStatus(hash: Hash): Promise<BlockStatus> {
        try {
            const key = "s" + hash
            const status = await this.database.get(key)
            return Number(status)
        } catch (e) {
            if (e.notFound) { return 0 }
            logger.error(`Fail to getBlockStatus : ${e}`)
            return Promise.reject(e)
        }
    }

    public async setBlockTip(hash: Hash) {
        await this.database.put("__blockTip", hash.toBuffer())
    }

    public async getBlockTip(): Promise<DBBlock | undefined> {
        return this.getTip("__blockTip")
    }

    public async setHeaderTip(hash: Hash) {
        await this.database.put("__headerTip", hash.toBuffer())
    }

    public async getHeaderTip(): Promise<DBBlock | undefined> {
        return this.getTip("__headerTip")
    }

    public async getBlock(hash: Hash): Promise<AnyBlock> {
        try {
            const dbBlock = await this.getDBBlock(hash)
            logger.debug(`DBBlock Key=${"b" + hash} Data=${dbBlock.offset}/${dbBlock.length}`)
            return this.dbBlockToBlock(dbBlock)
        } catch (e) {
            if (e.notFound) {
                e.error(`Block not found : ${e}`)
            }
            if (e instanceof DecodeError) {
                // TODO: Schedule rerequest or file lookup
                logger.error(`Could not decode block ${hash}`)
                throw e
            }
            return Promise.reject(e)
        }
    }

    public async getBlockHeader(hash: Hash): Promise<AnyBlockHeader | undefined> {
        try {
            const dbBlock = await this.getDBBlock(hash)
            if (dbBlock === undefined) { return undefined }
            return dbBlock.header
        } catch (e) {
            logger.error(`getBlockHeader failed : Hash=${hash}\n${e}`)
            return Promise.reject(e)
        }
    }

    public async getBlocksRange(fromHeight: number, count?: number): Promise<AnyBlock[]> {
        try {
            const dbBlockArray = await this.getDBBlocksRange(fromHeight, count)
            const blockArray: AnyBlock[] = []
            for (const dbBlock of dbBlockArray) {
                const block = await this.dbBlockToBlock(dbBlock)
                blockArray.push(block)
            }
            return blockArray
        } catch (e) {
            logger.error(`getBlocksRange failed\n${e}`)
            return Promise.reject(e)
        }
    }
    public async getHeadersRange(fromHeight: number, count?: number): Promise<AnyBlockHeader[]> {
        try {
            const dbBlockArray = await this.getDBBlocksRange(fromHeight, count)
            const headerArray: AnyBlockHeader[] = []
            for (const dbBlock of dbBlockArray) {
                headerArray.push(dbBlock.header)
            }
            return headerArray
        } catch (e) {
            logger.error(`getHeadersRange failed\n${e}`)
            return Promise.reject(e)
        }
    }

    public async getDBBlocksRange(fromHeight: number, count?: number): Promise<DBBlock[]> {
        try {
            const dbBlockArray: DBBlock[] = []
            let height = fromHeight
            let hash = await this.getHashAtHeight(height)
            while (hash) {
                if (dbBlockArray.length === count) { break }
                const dbBlock = await this.getDBBlock(hash)
                dbBlockArray.push(dbBlock)
                height++
                hash = await this.getHashAtHeight(height)
            }
            return dbBlockArray
        } catch (e) {
            logger.error(`getBlocksRange failed\n${e}`)
            return Promise.reject(e)
        }
    }

    public async getBlockHeight(hash: Hash): Promise<number | undefined> {
        try {
            const block = await this.getDBBlock(hash)
            const height = (block !== undefined) ? block.height : undefined
            return Promise.resolve(height)
        } catch (e) {
            logger.error(`getBlockHeight failed: ${e}`)
            return Promise.reject(e)
        }
    }

    public async getDBBlock(hash: Hash): Promise<DBBlock | undefined> {
        let decodingDBEntry = false
        try {
            const key = "b" + hash
            const encodedBlock = await this.database.get(key)
            decodingDBEntry = true
            const block = DBBlock.decode(encodedBlock)
            if (block) {
                return block
            } else {
                // TODO: Schedule Rebuild from file or rerequest from network
                logger.debug(`Could not decode block ${hash}`)
                const decodeError = new DecodeError()
                decodeError.hash = hash
                throw decodeError
            }
        } catch (e) {
            if (e.notFound) { return undefined }
            if (decodingDBEntry) {
                // TODO: Schedule rerequest or file lookup
                logger.error(`Could not decode block ${hash}`)
                const decodeError = new DecodeError()
                decodeError.hash = hash
                throw decodeError
            }
            return Promise.reject(e)
        }
    }

    // Async safe, block height will not change, previous block will not change
    private async makeDBBlock(header: AnyBlockHeader): Promise<{ current: DBBlock, previous?: DBBlock }> {
        try {
            let height = 0
            let previous: DBBlock
            let workEMA = 0
            let timeEMA = DifficultyAdjuster.getTargetTime()

            if (header instanceof BlockHeader) {
                if (header.previousHash.length <= 0) {
                    return Promise.reject(`Block has no previous hashes`)
                }
                // Async safe, previousBlock's height will not change
                previous = await this.getDBBlock(header.previousHash[0])
                const prevTimeEMA = previous.timeEMA
                const prevWorkEMA = Difficulty.decode(previous.workEMA)

                const timeDelta = header.timeStamp - previous.header.timeStamp
                const workDelta = Difficulty.decode(header.difficulty)

                timeEMA = DifficultyAdjuster.calcTimeEMA(timeDelta, prevTimeEMA)
                workEMA = DifficultyAdjuster.calcWorkEMA(workDelta, prevWorkEMA).encode()

                height = previous.height + 1
            }

            return { current: new DBBlock({ header, height, timeEMA, workEMA }), previous }
        } catch (e) {
            logger.error(`failed to make DBBlock : ${e}`)
            throw e
        }
    }

    private async dbBlockToBlock(dbBlock: DBBlock): Promise<AnyBlock> {
        if (dbBlock.offset !== undefined && dbBlock.length !== undefined && dbBlock.fileNumber !== undefined) {
            return this.blockFile.get(dbBlock.fileNumber, dbBlock.offset, dbBlock.length)
        } else {
            logger.error(`Fail to dbBlock to block : Block file information is not found`)
            throw new Error("Block could not be found")
        }
    }

    private async getOrInitKey(key: string, value: any = 0): Promise<any> {
        try {
            const p = this.database.get(key)
            const v = await p
            return v
        } catch (e) {
            if (e.notFound) {
                await this.database.put(key, value)
                return value
            }
            throw e
        }
    }

    private async getTip(key: string): Promise<DBBlock | undefined> {
        try {
            const hashData = new Uint8Array(await this.database.get(key))
            const hash = new Hash(hashData)
            const block = await this.getDBBlock(hash)
            return block
        } catch (e) {
            if (e.notFound) { return undefined }
            logger.error(`Fail to getTip : ${e}`)
            throw e
        }
    }
}
