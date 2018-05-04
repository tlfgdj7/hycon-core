import { getLogger } from "log4js"
import { Socket } from "net"
import * as net from "net"
import { setTimeout } from "timers"
import { Block } from "../../common/block"
import { AnyBlockHeader } from "../../common/blockHeader"
import { SignedTx } from "../../common/txSigned"
import { BlockHeader, GetTxsReturn, IGetTxsReturn, IStatus } from "../../serialization/proto"
import * as proto from "../../serialization/proto"
import { IGetBlocksByHashReturn, IGetHeadersByHashReturn } from "../../serialization/proto"
import { GetHeadersByHashReturn, IPutBlockReturn, PutBlock, PutBlockReturn } from "../../serialization/proto"
import { IGetBlocksByRangeReturn, IGetHeadersByRangeReturn } from "../../serialization/proto"
import { IPingReturn, IPutTxReturn, Ping, PingReturn, PutTx, PutTxReturn, Tx } from "../../serialization/proto"
import { IPeer } from "../ipeer"
import { Packet } from "./packet"
import { PeerBasic, PeerMode, PeerState } from "./peerBasic"
import { TurtleNetwork } from "./turtleNetwork"
import { Hash } from "../../util/hash"
// tslint:disable-next-line:no-var-requires
const delay = require("delay")
const logger = getLogger("NetPeer")
logger.level = "debug"

export abstract class PeerNet extends PeerBasic implements IPeer {

    private static MaxTryCount = 20
    private static PollingStep = 100  // milli seconds

    protected nonce: number = 100

    constructor(server: TurtleNetwork, socket: Socket, mode: PeerMode) {
        super(socket, mode)
        this.network = server

    }

    public close() {
        logger.info(`Replier Gracefullly Closed`)

        switch (this.peerMode) {
            case PeerMode.AcceptedSession:
                this.network.removePeer(this)
                break

            case PeerMode.ConnectedSession:
                setTimeout(() => {
                    this.reconnect()
                }, 2000)
                this.state = PeerState.Disconnected
                break
        }

    }

    // abstract public onReceiveMessage(res: proto.Node): void

    public status(): Promise<proto.IStatus> {
        return new Promise<proto.Status>((resolve, reject) => {
            const status = new proto.Status()
            this.sendStatus(status)
            this.statusQueue.push({ resolve, reject })
        })
    }

    // send status
    public sendStatus(block: proto.Status) {
        const encodeReq = proto.Network.encode({ status: { version: 0, networkid: "hycon" } }).finish()
        this.sendBuffer(encodeReq)
    }

    // ping
    public async ping(): Promise<number> {
        return new Promise<number>((resolve, reject) => {
            this.sendPing()
            this.pingQueue.push({ resolve, reject })
        })
    }

    public sendPing() {
        const encodeReq = proto.Network.encode({ ping: { nonce: this.nonce++ } }).finish()
        this.sendBuffer(encodeReq)
    }

    public sendPingReturn(userNonce: number) {
        const encodeReq = proto.Network.encode({ pingReturn: { nonce: userNonce } }).finish()
        this.sendBuffer(encodeReq)
    }

    // putTx
    public async putTxs(txs: SignedTx[]): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            this.sendPutTx(txs)
            this.putTxQueue.push({ resolve, reject })
        })

    }
    public sendPutTx(txs: SignedTx[]) {
        const encodeReq = proto.Network.encode({ putTx: { txs } }).finish()
        this.sendBuffer(encodeReq)
    }

    public sendPutTxReturn(success: boolean) {
        const encodeReq = proto.Network.encode({ putTxReturn: { success } }).finish()
        this.sendBuffer(encodeReq)
    }

    // get txs
    public async getTxs(minFee: number): Promise<SignedTx[]> {
        return new Promise<SignedTx[]>((resolve, reject) => {
            this.sendGetTxs(minFee)
            this.getTxsQueue.push({ resolve, reject })
        })
    }

    public sendGetTxs(minFee: number) {
        const encodeReq = proto.Network.encode({ getTxs: { minFee } }).finish()
        this.sendBuffer(encodeReq)
    }

    public sendGetTxsReturn(success: boolean, txs: Tx[]) {
        const encodeReq = proto.Network.encode({ getTxsReturn: { success, txs: [] } }).finish()
        this.sendBuffer(encodeReq)
    }

    // putBlock
    public async putBlocks(blocks: Block[]): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            this.sendPutBlock(blocks)
            this.putBlockQueue.push({ resolve, reject })
        })
    }
    public sendPutBlock(blocks: Block[]) {
        const encodeReq = proto.Network.encode({ putBlock: { blocks } }).finish()
        this.sendBuffer(encodeReq)
    }

    public sendPutBlockReturn(success: boolean) {
        const encodeReq = proto.Network.encode({ putBlockReturn: { success } }).finish()
        this.sendBuffer(encodeReq)
    }

    // get blocks by hash
    public async getBlocksByHashes(hash: any[]): Promise<Block[]> {
        return new Promise<Block[]>((resolve, reject) => {
            this.sendGetBlocksByHash([])
            this.getBlocksByHashQueue.push({ resolve, reject })
        })
    }

    public sendGetBlocksByHash(hashes: Uint8Array[]) {
        const encodeReq = proto.Network.encode({ getBlocksByHash: { hashes } }).finish()
        this.sendBuffer(encodeReq)
    }

    public sendGetBlocksByHashReturn(success: boolean, blocks: Block[]) {
        const encodeReq = proto.Network.encode({ getBlocksByHashReturn: { success, blocks } }).finish()
        this.sendBuffer(encodeReq)
    }

    public sendGetHeadersByHashes(hashes: Uint8Array[]) {
        const encodeReq = proto.Network.encode({ getHeadersByHash: { hashes } }).finish()
        this.sendBuffer(encodeReq)
    }

    public sendGetHeadersByHashReturn(success: boolean, headers: BlockHeader[]) {
        const encodeReq = proto.Network.encode({ getHeadersByHashReturn: { success, headers } }).finish()
        this.sendBuffer(encodeReq)
    }

    // get blocks  by range
    public getBlocksByRange(fromHeight: number, count: number): Promise<Block[]> {
        return new Promise<Block[]>((resolve, reject) => {
            this.sendGetBlocksByRange(fromHeight, count)
            this.getBlocksByRangeQueue.push({ resolve, reject })
        })

    }

    public sendGetBlocksByRange(fromHeight: number, count: number) {
        const encodeReq = proto.Network.encode({ getBlocksByRange: { fromHeight, count } }).finish()
        this.sendBuffer(encodeReq)
    }

    public sendGetBlocksByRangeReturn(success: boolean, blocks: Block[]) {
        const encodeReq = proto.Network.encode({ getBlocksByRangeReturn: { success, blocks } }).finish()
        this.sendBuffer(encodeReq)
    }

    public async getHeadersByHashes(hash: any[]): Promise<AnyBlockHeader[]> {
        return new Promise<AnyBlockHeader[]>((resolve, reject) => {
            this.sendGetHeadersByHashes(hash)
            this.getHeadersByHashQueue.push({ resolve, reject })
        })
    }

    public async getHeadersByRange(fromHeight: number, count: number): Promise<AnyBlockHeader[]> {
        return new Promise<AnyBlockHeader[]>((resolve, reject) => {
            this.sendGetHeadersByRange(fromHeight, count)
            this.getHeadersByRangeQueue.push({ resolve, reject })
        })
    }

    public sendGetHeadersByRange(fromHeight: number, count: number) {
        const encodeReq = proto.Network.encode({ getHeadersByRange: { fromHeight, count } }).finish()
        this.sendBuffer(encodeReq)
    }

    public sendGetHeadersByRangeReturn(success: boolean, headers: BlockHeader[]) {
        const encodeReq = proto.Network.encode({ getHeadersByRangeReturn: { success, headers } }).finish()
        this.sendBuffer(encodeReq)
    }

    public sendGetPeers(count: number) {
        const encodeReq = proto.Network.encode({ getPeers: { count } }).finish()
        this.sendBuffer(encodeReq)
    }

    public sendGetPeersReturn(success: boolean, peers: proto.Peer[]) {
        const encodeReq = proto.Network.encode({ getPeersReturn: { success, peers } }).finish()
        this.sendBuffer(encodeReq)
    }

    public setConnectedCallback(callback: () => void) {
        this.connectedCallback = callback
    }

    public async parsePacket(packet: Packet): Promise<any> {
        const data = packet.popBuffer()
        const res = proto.Network.decode(data)

        await this.onReceiveMessage(packet, res)
    }

    public onReceiveMessage(packet: Packet, res: proto.Network) {
        if (res.status) {
            logger.debug(`Status=${JSON.stringify(res.status)}`)
        }
        if (res.ping) {
            const userNonce = Number(res.ping.nonce.toString()) + 3000
            logger.debug(`Ping Nonce=${res.ping.nonce}`)
            this.sendPingReturn(userNonce)
        }
        if (res.pingReturn) {
            if (this.pingQueue.length > 0) {
                const cb = this.pingQueue.pop()
                cb.resolve(res.pingReturn.nonce)
            }
            logger.debug(`Ping Response Nonce=${res.pingReturn.nonce}`)
        }
        if (res.putTx) {
            logger.debug(`PutTx=${JSON.stringify(res.putTx.txs)}`)
            this.sendPutTxReturn(true)
        }
        if (res.putTxReturn) {
            if (this.putTxQueue.length > 0) {
                const cb = this.putTxQueue.pop()
                cb.resolve(res.putTxReturn.success)
            }
            // logger.debug(`PutTx Response Success=${res.putTxReturn.success}`)
        }

        if (res.getTxs) {
            this.sendGetTxsReturn(true, [])
        }
        if (res.getTxsReturn) {
            if (this.getTxsQueue.length > 0) {
                const cb = this.getTxsQueue.pop()
                cb.resolve(res.getTxsReturn.txs)
            }
            logger.debug(`GetTxsReturn Response Success=${res.getTxsReturn.success}`)
        }

        if (res.putBlock) {
            logger.debug(`PutBlock=${JSON.stringify(res.putBlock.blocks)}`)
            const m = res.putBlock.blocks[0].miner
            this.sendPutBlockReturn(true)
        }
        if (res.putBlockReturn) {
            if (this.putBlockQueue.length > 0) {
                const cb = this.putBlockQueue.pop()
                cb.resolve(res.putBlockReturn.success)
            }

            logger.debug(`PutBlock Response Success=${res.putBlockReturn.success}`)
        }

        if (res.getBlocksByHash) {
            logger.debug(`getBlocksByHash=${JSON.stringify(res.getBlocksByHash.hashes)}`)
            this.sendGetBlocksByHashReturn(true, [])
        }
        if (res.getBlocksByHashReturn) {
            if (this.getBlocksByHashQueue.length > 0) {
                const cb = this.getBlocksByHashQueue.pop()
                cb.resolve(res.getBlocksByHashReturn.blocks)
            }

            logger.debug(`getBlocksByHashReturn Response Success=${res.getBlocksByHashReturn.success}`)
        }

        if (res.getHeadersByHash) {
            logger.debug(`getHeadersByHash=${JSON.stringify(res.getHeadersByHash.hashes)}`)
            this.sendGetHeadersByHashReturn(true, [])
        }
        if (res.getHeadersByHashReturn) {
            if (this.getHeadersByHashQueue.length > 0) {
                const cb = this.getHeadersByHashQueue.pop()
                cb.resolve(res.getHeadersByHashReturn.headers)
            }
            logger.debug(`getHeadersByHashReturn Response Success=${res.getHeadersByHashReturn.success}`)
        }

        if (res.getBlocksByRange) {
            logger.debug(`getBlocksByRange=${JSON.stringify(res.getBlocksByRange)}`)
            this.sendGetBlocksByRangeReturn(true, [])
        }
        if (res.getBlocksByRangeReturn) {
            if (this.getBlocksByRangeQueue.length > 0) {
                const cb = this.getBlocksByRangeQueue.pop()
                cb.resolve(res.getBlocksByRangeReturn.blocks)
            }

            logger.debug(`getBlocksByRangeReturn Response Success=${res.getBlocksByRangeReturn.success}`)
        }

        if (res.getHeadersByRange) {
            logger.debug(`getHeadersByRange=${JSON.stringify(res.getHeadersByRange)}`)
            this.sendGetHeadersByRangeReturn(true, [])
        }
        if (res.getHeadersByRangeReturn) {
            if (this.getHeadersByRangeQueue.length > 0) {
                const cb = this.getHeadersByRangeQueue.pop()
                cb.resolve(res.getHeadersByRangeReturn.headers)
            }
            logger.debug(`getHeadersByRangeReturn Response Success=${res.getHeadersByRangeReturn.success}`)
        }

    }

    public getPeers(count: number): Promise<proto.IPeer[]> {
        throw new Error("Method not implemented.");
    }
    public getTip(): { hash: Hash; height: number; } {
        throw new Error("Method not implemented.")
    }

}
