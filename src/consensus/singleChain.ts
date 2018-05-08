import * as bigInt from "big-integer"
import { getLogger } from "log4js"
import Long = require("long")
import { Address } from "../common/address"
import { AsyncLock } from "../common/asyncLock"
import { AnyBlock, Block } from "../common/block"
import { GenesisBlock } from "../common/blockGenesis"
import { AnyBlockHeader, BlockHeader } from "../common/blockHeader"
import { PublicKey } from "../common/publicKey"
import { GenesisSignedTx } from "../common/txGenesisSigned"
import { TxPool } from "../common/txPool"
import { SignedTx } from "../common/txSigned"
import { CpuMiner } from "../miner/cpuMiner"
import { MinerServer } from "../miner/minerSever"
import { Server } from "../server"
import * as utils from "../util/difficulty"
import { Graph } from "../util/graph"
import { Hash } from "../util/hash"
import { Account } from "./database/account"
import { Database } from "./database/database"
import { DBBlock } from "./database/dbblock"
import { TxDatabase } from "./database/txDatabase"
import { TxList } from "./database/txList"
import { IStateTransition, WorldState } from "./database/worldState"
import { AnySignedTx, IConsensus, NewBlockCallback } from "./iconsensus"
import { BlockStatus } from "./sync"

const logger = getLogger("SingleChain Concensus")
export class SingleChain implements IConsensus {
    private server: Server
    private newBlockCallbacks: NewBlockCallback[]
    private db: Database
    private worldState: WorldState
    private blockTip: DBBlock
    private headerTip: DBBlock
    private txUnit: number
    private forkHeight: number
    private graph: Graph // For debug
    private txdb?: TxDatabase
    constructor(server: Server, dbPath: string, wsPath: string, filePath: string, txPath?: string) {
        this.server = server
        this.newBlockCallbacks = []
        this.db = new Database(dbPath, filePath)
        this.worldState = new WorldState(wsPath)
        this.forkHeight = -1
        this.txUnit = 1000
        this.graph = new Graph()
        if (txPath) { this.txdb = new TxDatabase(txPath) }
    }
    public async getNonce(address: Address): Promise<number> {
        const account = await this.worldState.getAccount(this.blockTip.header.stateRoot, address)
        logger.info(`Found account(${address.toString()}): {balance: ${account.balance}, nonce: ${account.nonce}}`)
        return account.nonce
    }

    public async init(): Promise<void> {
        try {
            await this.db.init()
            this.blockTip = await this.db.getBlockTip()
            this.headerTip = await this.db.getHeaderTip()

            if (this.blockTip === undefined) {
                logger.debug(`No blocks in DB, loading genesis from file.`)
                const genesis = GenesisBlock.loadFromFile()
                const genesisHash = new Hash(genesis.header)
                const transition = await this.worldState.first(genesis)
                await this.worldState.putPending(transition.batch, transition.mapAccount)
                genesis.header.stateRoot = transition.currentStateRoot

                // Test wallets
                const testWalletTransition = await this.worldState.createTestAddresses(transition.currentStateRoot)
                await this.worldState.putPending(testWalletTransition.batch, testWalletTransition.mapAccount)
                genesis.header.stateRoot = testWalletTransition.currentStateRoot
                await this.worldState.print(testWalletTransition.currentStateRoot)

                await this.putBlock(genesis)
                this.blockTip = await this.db.getBlockTip()
                // await this.putBlock(genesis)
                this.graph.initGraph(genesis.header)
            }

            this.headerTip = await this.db.getHeaderTip()
            if (this.headerTip === undefined || this.blockTip === undefined) {
                throw new Error("Could not initialize DB with genesis block")
            }

            if (this.txdb) {
                // TODO : TxDB Init
            }

            this.server.txPool.onTopTxChanges(10, (txs: SignedTx[]) => this.createCandidateBlock(txs))
            this.server.miner.addCallbackNewBlock((block: Block) => this.putBlock(block))
            logger.debug(`Initialization of singlechain is over.`)
        } catch (e) {
            logger.error(`Initialization fail in singleChain : ${e}`)
            process.exit(1)
        }
    }

    public async putBlock(block: AnyBlock): Promise<boolean> {
        try {
            const blockHash = new Hash(block.header)
            logger.info(`Put Block : ${blockHash}`)
            const blockStatus = await this.getBlockStatus(blockHash)
            if (blockStatus === BlockStatus.Rejected) {
                logger.warn(`Already rejected Block : ${blockHash}`)
                return false
            } else if (blockStatus === BlockStatus.MainChain || blockStatus === BlockStatus.Block) {
                logger.warn(`Already exsited Header : ${blockHash}`)
                return false
            }
            let blockTxs: SignedTx[] = []
            if (block instanceof Block) {
                blockTxs = block.txs
                const verifyResult = await this.verifyBlock(block)
                if (!verifyResult.isVerified) {
                    logger.error(`Invalid Block Rejected : ${blockHash}`)
                    await this.db.setBlockStatus(blockHash, BlockStatus.Rejected)
                    return false
                }
                const transitionResult = verifyResult.stateTransition
                await this.worldState.putPending(transitionResult.batch, transitionResult.mapAccount)
                this.graph.addToGraph(block.header, this.graph.color.outgoing)
            }
            const { current, previous } = await this.db.putBlock(blockHash, block)
            if (this.txdb) { await this.txdb.putTxs(blockHash, block.txs) }

            // Update headerTopTip first, then update blockTopTip
            this.headerTip = this.updateTopTip(this.headerTip, current, previous).newTip
            const { newTip, prevTip, isTopTip } = this.updateTopTip(this.blockTip, current, previous)
            this.blockTip = newTip
            const bStatus: BlockStatus = (isTopTip) ? BlockStatus.MainChain : BlockStatus.Block
            if (isTopTip) {
                await this.db.setHashByHeight(current.height, blockHash)
                await this.db.setBlockTip(blockHash)
                if (this.headerTip.height <= current.height) {
                    await this.db.setHeaderTip(blockHash)
                }
                const bTip = await this.db.getBlockTip()
            }
            await this.db.setBlockStatus(blockHash, bStatus)

            utils.processBlock(block.header.difficulty)

            this.newBlock(block)
            // TODO : Tidy up code.
            if (isTopTip) { await this.reorganization() }
            const txs = this.server.txPool.updateTxs(blockTxs, this.txUnit)
            if (isTopTip) { this.createCandidateBlock(txs) }
            return true
        } catch (e) {
            logger.error(e)
            return false
        }
    }
    public async putHeader(header: AnyBlockHeader): Promise<boolean> {
        try {
            const blockHash = new Hash(header)
            const blockStatus = await this.getBlockStatus(new Hash(header))
            if (blockStatus === BlockStatus.Rejected) {
                logger.warn(`Already rejected Block : ${blockHash}`)
                return false
            } else if (blockStatus === BlockStatus.MainChain || blockStatus === BlockStatus.Block || blockStatus === BlockStatus.Header) {
                logger.warn(`Already exsited Header : ${blockHash}`)
                return false
            }
            if (header instanceof BlockHeader) {
                if (!await this.verifyHeader(header)) {
                    logger.error(`Invalid Header Rejected : ${blockHash}`)
                    await this.db.setBlockStatus(blockHash, BlockStatus.Rejected)
                    return Promise.resolve(false)
                }
            }
            const { current, previous } = await this.db.putHeader(blockHash, header)
            await this.db.setBlockStatus(blockHash, BlockStatus.Header)

            if (this.updateTopTip(this.headerTip, current, previous).isTopTip) {
                await this.db.setHeaderTip(blockHash)
            }
            return Promise.resolve(true)
        } catch (e) {
            return Promise.reject(e)
        }
    }
    public addCallbackNewBlock(callback: (block: AnyBlock) => void, priority?: number): void {
        if (priority) {
            this.newBlockCallbacks.splice(priority, 0, callback)
        } else {
            this.newBlockCallbacks.push(callback)
        }
    }
    public removeCallbackNewBlock(callback: (block: AnyBlock) => void): void {
        for (let i = 0; i < this.newBlockCallbacks.length;) {
            if (this.newBlockCallbacks[i] === callback) {
                this.newBlockCallbacks.splice(i, 1)
            } else {
                i++
            }
        }
    }
    public async getBlockByHash(hash: Hash): Promise<AnyBlock> {
        try {
            return await this.db.getBlock(hash)
        } catch (e) {
            logger.error(`Fail to getBlockByHash : ${e}`)
            Promise.reject(e)
        }
    }
    public async getHeaderByHash(hash: Hash): Promise<AnyBlockHeader> {
        try {
            const header = await this.db.getBlockHeader(hash)
            if (header === undefined) { return Promise.reject(`Not found header ${hash.toString()}`) }
            return Promise.resolve(header)
        } catch (e) {
            logger.error(`Fail to getHeaderByHash : ${e}`)
            Promise.reject(e)
        }
    }

    public getBlocksRange(fromHeight: number, count?: number): Promise<AnyBlock[]> {
        try {
            const blockArray = this.db.getBlocksRange(fromHeight, count)
            return Promise.resolve(blockArray)
        } catch (e) {
            logger.error(`Fail to getBlocksRange : ${e}`)
            Promise.reject(e)
        }
    }

    public async getHeadersRange(fromHeight: number, count?: number): Promise<AnyBlockHeader[]> {
        return await this.db.getHeadersRange(fromHeight, count)
    }

    public async getAccount(address: Address): Promise<Account> {
        try {
            if (this.blockTip !== undefined) {
                const account = await this.worldState.getAccount(this.blockTip.header.stateRoot, address)
                return Promise.resolve(account)
            } else {
                logger.error(`There is not any tips`)
                return Promise.reject(`There is not any tips`)
            }
        } catch (e) {
            logger.error(`Fail to getAccount : ${e}`)
            return Promise.reject(e)
        }
    }

    public async getLastTxs(address: Address, count?: number): Promise<TxList[]> {
        try {
            if (this.txdb) {
                return await this.txdb.getLastTxs(address, count)
            } else {
                return Promise.reject(`The database to get txs does not exist.`)
            }
        } catch (e) {
            return Promise.reject(`Fail to get Last txs : ${e}`)
        }
    }

    public getBlockStatus(hash: Hash): Promise<BlockStatus> {
        return this.db.getBlockStatus(hash)
    }
    public getHeaderTip(): { hash: Hash; height: number } {
        const block = this.headerTip
        return { hash: new Hash(block.header), height: block.height }
    }
    public getBlocksTip(): { hash: Hash; height: number } {
        const block = this.blockTip
        return { hash: new Hash(block.header), height: block.height }
    }

    public isTxValid(tx: SignedTx): Promise<boolean> {
        // TODO : Check existence in DB.
        return Promise.resolve(true)
    }

    public async getTx(hash: Hash): Promise<TxList | undefined> {
        if (this.txdb) {
            return await this.txdb.getTx(hash)
        } else {
            logger.error(`User not use txDatabase for RestAPI`)
            return Promise.resolve(undefined)
        }
    }
    public async getHash(height: number): Promise<Hash> {
        return await this.db.getHashByHeight(height)
    }

    public async testMakeBlock(txs: SignedTx[]): Promise<Block> {
        return Promise.resolve(await this.createCandidateBlock(txs))
    }

    private newBlock(block: AnyBlock): void {
        for (const callback of this.newBlockCallbacks) {
            callback(block)
        }
    }

    // tslint:disable-next-line:max-line-length
    private updateTopTip(tip: DBBlock, block: DBBlock, previous?: DBBlock): { newTip: DBBlock, prevTip: Hash | undefined, isTopTip: boolean } {
        try {
            let prevTip
            let isTopTip = false
            if (block.header instanceof BlockHeader) {
                if (previous) {
                    const previousHash = block.header.previousHash[0].toString()
                    const tipHash = new Hash(tip.header)
                    if (tipHash.toString() === previousHash || tip.height < block.height) {
                        prevTip = tipHash
                        tip = block
                        isTopTip = true
                    } else {
                        // TODO : Change reorg logic.
                    }
                } else {
                    throw new Error(`Previous block undefined in updateTopTip`)
                }
            } else {
                tip = block
                isTopTip = true
            }
            return { newTip: tip, prevTip, isTopTip }
        } catch (e) {
            logger.error(`Fail to updateTopTip : ${e}`)
            throw new Error(e)
        }
    }
    private async createCandidateBlock(txs: SignedTx[]): Promise<Block> {
        try {
            const previousHash = new Hash(this.blockTip.header)
            // TODO : get Miner address
            const miner: Address = undefined
            const previousHeader = await this.db.getBlockHeader(previousHash)
            txs.sort((txA, txB) => txA.nonce - txB.nonce)
            const worldStateResult = await this.worldState.next(txs, previousHeader.stateRoot)
            const header = new BlockHeader({
                difficulty: utils.getTargetDifficulty(),
                merkleRoot: new Hash(),
                nonce: -1,
                previousHash: [previousHash],
                stateRoot: worldStateResult.stateTransition.currentStateRoot,
                timeStamp: Date.now(),
            })
            const newBlock = new Block({ header, txs: worldStateResult.validTxs, miner })
            newBlock.updateMerkleRoot()

            if (!await this.verifyPreBlock(newBlock)) { throw new Error("Not verified.") }
            this.server.miner.newCandidateBlock(newBlock)
            return Promise.resolve(newBlock)
        } catch (e) {
            logger.error(`Fail to createCandidateBlock : ${e}`)
            return Promise.reject(e)
        }
    }

    private async verifyBlock(block: Block): Promise<{ isVerified: boolean, stateTransition?: IStateTransition }> {
        const isValidHeader = await this.verifyHeader(block.header)
        if (!isValidHeader) { return Promise.resolve({ isVerified: false }) }

        const verifyResult = await this.verifyPreBlock(block)
        if (!verifyResult.isVerified) {
            return Promise.resolve({ isVerified: false })
        }

        return Promise.resolve(verifyResult)
    }

    private async verifyPreBlock(block: Block): Promise<{ isVerified: boolean, stateTransition?: IStateTransition }> {
        const txVerify = block.txs.every((tx) => verifyTx(tx))
        if (!txVerify) { return Promise.resolve({ isVerified: false }) }

        const merkleRootVerify = block.calculateMerkleRoot().equals(block.header.merkleRoot)
        if (!merkleRootVerify) { return Promise.resolve({ isVerified: false }) }
        const previousHeader = await this.db.getBlockHeader(block.header.previousHash[0])
        const { stateTransition, validTxs, invalidTxs } = await this.worldState.next(block.txs, previousHeader.stateRoot, block.miner)
        if (!stateTransition.currentStateRoot.equals(block.header.stateRoot)) {
            logger.info(`State root is incorrect`)
            return { isVerified: false }
        }
        if (invalidTxs.length > 0) {
            logger.info(`Block contains invalid Txs`)
            return { isVerified: false }
        }

        if (validTxs.length !== block.txs.length) {
            logger.info(`Not all txs were valid`)
            return { isVerified: false }
        }

        return { isVerified: true, stateTransition }
    }

    private async verifyHeader(header: BlockHeader): Promise<boolean> {
        const preHash = header.preHash()
        const cryptoHash = await CpuMiner.hash(preHash, header.nonce.toString(16))
        const difficulty = header.difficulty
        const bufTarget = Buffer.from(utils.difficulty(utils.unforcedInt(difficulty)), "hex")
        const target = new Uint8Array(bufTarget).subarray(0, MinerServer.LEN_TARGET)

        if ((cryptoHash[0] < target[0]) || ((cryptoHash[0] === target[0]) && (cryptoHash[1] < target[1]))) {
            return Promise.resolve(true)
        }
        return Promise.resolve(false)
    }

    private async reorganization(): Promise<void> {
        try {
            logger.debug(`Reorganization Started`)
            if (this.forkHeight === -1) { return Promise.resolve(undefined) }
            const tip = this.blockTip
            const result = await this.db.getDBBlockMapByHeights(this.forkHeight, tip.height)
            const bmap = result.blockMap
            const hmap = result.hashMap

            if (bmap.get(tip.height).length !== 1) {
            } else {
                const mainChain: DBBlock[] = []
                let block = tip
                for (let i = tip.height; i >= this.forkHeight; i--) {
                    mainChain.push(block)
                    const blocks = bmap.get(i)
                    for (let index = 0; index < blocks.length; index++) {
                        if (new Hash(blocks[index].header).equals(new Hash(block.header))) {
                            blocks.splice(index, 1)
                            break
                        }
                    }
                    if (block.header instanceof BlockHeader) { block = hmap.get(block.header.previousHash[0].toString()) }
                }

                for (let i = tip.height - 1; i >= this.forkHeight; i--) {
                    for (const b of bmap.get(i)) {
                        const hash = new Hash(b.header)
                        const blk = await this.getBlockByHash(hash)
                        await this.db.setBlockStatus(hash, BlockStatus.Block)
                        if (blk instanceof Block) { await this.server.txPool.putTxs(blk.txs) }
                        // if (blk instanceof Block) { this.graph.removeFromGraph(blk.header) }
                    }
                }
                for (const b of mainChain) {
                    const hash = new Hash(b.header)
                    const blk = await this.getBlockByHash(hash)
                    await this.db.setBlockStatus(hash, BlockStatus.MainChain)
                    await this.db.setHashByHeight(b.height, hash)
                    if (blk instanceof Block) { this.server.txPool.updateTxs(blk.txs, 0) }
                }
                this.forkHeight = -1
            }
        } catch (e) {
            return Promise.reject(`Fail to reorganization : ${e}`)
        }
    }
}

export function verifyTx(tx: SignedTx | GenesisSignedTx): boolean {
    try {
        const pubKey = new PublicKey(tx)
        if (!pubKey.verify(tx)) { return false }
        return true
    } catch (e) { return false }
}
