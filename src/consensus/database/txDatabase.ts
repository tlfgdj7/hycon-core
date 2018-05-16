
import { getHashes } from "crypto"
import { ADDRGETNETWORKPARAMS } from "dns"
import levelup = require("levelup")
import { getLogger } from "log4js"
import rocksdb = require("rocksdb")
import { Address } from "../../common/address"
import { AnyBlock } from "../../common/block"
import { GenesisSignedTx } from "../../common/txGenesisSigned"
import { SignedTx } from "../../common/txSigned"
import * as proto from "../../serialization/proto"
import { Hash } from "../../util/hash"
import { AnySignedTx } from "../iconsensus"
import { SingleChain, verifyTx } from "../singleChain"
import { TxList } from "./txList"
const logger = getLogger("TxDB")

export class TxDatabase {
    public sc: SingleChain

    private database: levelup.LevelUp
    constructor(path: string) {
        const rocks: any = rocksdb(path)
        this.database = levelup(rocks)
        logger.info(`Now, you can use txDB.`)
    }
    public async init(blocks: AnyBlock[]) {
        await this.database.init()
        let txs: AnySignedTx[] = []
        let newTxs: AnySignedTx[] = []
        for (const block of blocks) {
            txs = txs.concat(block.txs)
        }
        logger.debug(` < initTxDB > Txs result : ${txs.length} / ${txs}`)

        const lastBlkHash = await this.database.getLastBlock(txs)
        const height = await this.sc.getBlockHeight(lastBlkHash)
        logger.debug(` < initTxDB > last block height, last block : ${lastBlkHash}, ${height}`)

        const newBlocks = await this.sc.getBlocksRange(height)
        for (const newBlock of newBlocks) {
            newTxs = newTxs.concat(newBlock.txs)
        }
        const n = newBlocks.length
        logger.debug(` < initTxDB > newBlocks.length, newBlocks : ${n}, ${newBlocks}`)

        if (n > 1) {
            for (let h = 1; h < n; h++) {
                logger.debug(` < initTxDB > h : ${h}`)
                const hash = await this.sc.getHash(height + h)
                this.putTxs(hash, newTxs)
            }
        }
    }

    public async getLastBlock(txs: AnySignedTx[]): Promise<Hash> {
        const hashData = new Uint8Array(await this.database.get("lastBlock"))
        return new Hash(hashData)
    }

    public async putTxs(blockHash: Hash, txs: AnySignedTx[]): Promise<void> {
        logger.error(`PutTxs length : ${txs.length}`)
        const batch: levelup.Batch[] = []
        const mapLastTx: Map<string, Hash> = new Map<string, Hash>()
        for (const tx of txs) {
            if (!verifyTx(tx)) { continue }
            const txList = new TxList(tx)
            txList.blockHash = blockHash
            // TODO : How to handle same tx different block? If db key change txHash to txListHash,
            // Every time a previousTo or previousFrom changes, key have to changed...
            const txHash = new Hash(tx)

            const toAddress = tx.to.toString()
            let tLastTx = mapLastTx.get(toAddress)
            if (tLastTx === undefined) {
                const lastTx = await this.getTx(tx.to)
                if (lastTx) { tLastTx = new Hash(lastTx.tx) }
            }
            if (tLastTx !== undefined) { txList.previousTo = tLastTx }
            mapLastTx.set(toAddress, txHash)

            if (tx instanceof SignedTx) {
                const fromAddress = tx.from.toString()
                let fLastTx = mapLastTx.get(fromAddress)
                if (fLastTx === undefined) {
                    const lastTx = await this.getTx(tx.from)
                    if (lastTx) { fLastTx = new Hash(lastTx.tx) }
                }
                if (fLastTx !== undefined) { txList.previousFrom = fLastTx }
                mapLastTx.set(fromAddress, txHash)
            }
            batch.push({ type: "put", key: txHash.toString(), value: txList.encode() })
            // logger.warn(`Put to TxDB : ${txHash.toString()} / ${txList.encode()}`)
        }
        for (const key of mapLastTx.keys()) {
            const txListHash = mapLastTx.get(key)
            // logger.warn(`Put to TxDB : ${key} / ${txListHash}`)
            batch.push({ type: "put", key, value: txListHash.toBuffer() })
        }
        batch.push({ type: "put", key: "lastBlock", value: blockHash.toBuffer() })

        await this.database.batch(batch)
        // logger.error(`After put to TxDB Check Using Address!!!!`)
        // for (const tx of txs) {
        //     if (!verifyTx(tx)) { continue }
        //     const toLastTxList = await this.getLastTxs(tx.to, 1)
        //     logger.warn(`${tx.to} last Tx's previous Hashes : ${toLastTxList[0].previousTo} / ${toLastTxList[0].previousFrom}`)
        //     if (tx instanceof SignedTx) {
        //         const fromLastTxList = await this.getLastTxs(tx.from, 1)
        //         const fTx = fromLastTxList[0].tx
        //         if (fTx instanceof SignedTx) {
        //             logger.warn(`${tx.from} last Tx :  ${fTx.from}`)
        //         }
        //     }
        // }
        // logger.error(`After put to TxDB Check Using TxHash!!!!`)
        // for (const tx of txs) {
        //     logger.warn(` Tx in DB : `, await this.getTx(new Hash(tx)))
        // }
    }

    public async getLastTxs(address: Address, count?: number): Promise<TxList[]> {
        const txs: TxList[] = []
        let txList = await this.getTx(address)
        while (txList) {
            txs.push(txList)
            if (txs.length === count) { break }
            if (txList.tx.to.equals(address)) {
                if (txList.previousTo !== undefined) {
                    txList = await this.getTx(txList.previousTo)
                } else { break }
            } else if (txList.tx instanceof SignedTx) {
                if (txList.tx.from.equals(address)) {
                    if (txList.previousFrom !== undefined) {
                        txList = await this.getTx(txList.previousFrom)
                    } else { break }
                }
            }
        }
        // TODO : Return with blockHash?
        return Promise.resolve(txs)
    }

    public async getTx(key: Address | Hash): Promise<TxList | undefined> {
        let decodingDBEntry = false
        try {
            let dbKey = key
            if (key instanceof Address) {
                const hashData = new Uint8Array(await this.database.get(key.toString()))
                dbKey = new Hash(hashData)
            }
            const value = await this.database.get(dbKey.toString())
            decodingDBEntry = true
            const txList = TxList.decode(value)
            return Promise.resolve(txList)
        } catch (e) {
            if (e.notFound) { return Promise.resolve(undefined) }
            if (decodingDBEntry) { logger.error(`Fail to decode TxList`) }
            return Promise.reject(`Fail to getLastTx of ${key} : ${e}`)
        }
    }
}
