import { getLogger } from "log4js"
import { SignedTx } from "./common/txSigned"
import { Packet } from "./network/turtle/packet"
import { Block, INode, Tx } from "./serialization/proto"
import * as proto from "./serialization/proto"

import { Server } from "./server"
const logger = getLogger("TestServer")

export class TestServer {
    public server: Server
    private txs: Tx[] = []
    private index: number = 1
    constructor(server: Server) {
        this.server = server
        setInterval(() => {
            this.makeTx()
        }, 700)
        setInterval(() => {
            this.makeBlock()
        }, 5000)
    }

    private async makeTx() {
        // logger.debug(`Make Tx  Current Queue=${this.txs.length}`)
        const newTx = new Tx({ amount: this.index++, fee: Math.random() * 10 })
        this.txs.push(newTx)
        const encoded: Uint8Array = proto.Network.encode({ putTx: { txs: [newTx] } }).finish()
        this.server.network.broadcast(new Buffer(encoded), null)
    }

    private async makeBlock() {
        // logger.debug(`Make Block`)
        const newBlock = new Block({ txs: this.txs })
        this.txs = []

        const encoded: Uint8Array = proto.Network.encode({ putBlock: { blocks: [newBlock] } }).finish()
        this.server.network.broadcast(new Buffer(encoded), null)
    }
}