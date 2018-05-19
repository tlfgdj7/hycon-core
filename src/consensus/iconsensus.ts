import { EventEmitter } from "events"
import { Address } from "../common/address"
import { AnyBlock, Block } from "../common/block"
import { GenesisBlock } from "../common/blockGenesis"
import { AnyBlockHeader, BlockHeader } from "../common/blockHeader"
import { GenesisBlockHeader } from "../common/genesisHeader"
import { GenesisSignedTx } from "../common/txGenesisSigned"
import { SignedTx } from "../common/txSigned"
import { Account } from "../consensus/database/account"
import { TxList } from "../consensus/database/txList"
import { BlockStatus } from "../consensus/sync"
import { Hash } from "../util/hash"
import { TxValidity } from "./database/worldState"

export type AnySignedTx = (GenesisSignedTx | SignedTx)

export type NewBlockCallback = (block: AnyBlock) => void
export interface IConsensus extends EventEmitter {
    init(): Promise<void>
    // HEY CHecks the Refs
    putBlock(block: Block): Promise<{ old: BlockStatus, new: BlockStatus }>
    putHeader(header: BlockHeader): Promise<{ old: BlockStatus, new: BlockStatus }>
    getBlockByHash(hash: Hash): Promise<AnyBlock>
    getHeaderByHash(hash: Hash): Promise<AnyBlockHeader>
    getBlocksRange(fromHeight: number, count?: number): Promise<AnyBlock[]>
    getHeadersRange(fromHeight: number, count?: number): Promise<AnyBlockHeader[]>
    getAccount(address: Address): Promise<Account>
    getLastTxs(address: Address, count?: number): Promise<Array<{ txList: TxList, timestamp: number }>>
    getNextTxs(address: Address, txHash: Hash, count?: number): Promise<Array<{ txList: TxList, timestamp: number }>>
    getBlockStatus(hash: Hash): Promise<BlockStatus>
    getHeaderTip(): { hash: Hash, height: number }
    getBlocksTip(): { hash: Hash, height: number }
    getTx(hash: Hash): Promise<{ tx: TxList, timestamp: number, confirmation: number } | undefined>
    txValidity(tx: SignedTx): Promise<TxValidity>
    getHash(height: number): Promise<Hash>
    getBlockHeight(hash: Hash): Promise<number | undefined>
    getPendingTxs(index: number, count: number): { txs: SignedTx[], length: number, totalAmount: Long, totalFee: Long }
}
