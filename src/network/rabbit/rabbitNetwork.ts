import { SIGPIPE } from "constants"
import { getLogger } from "log4js"
import * as net from "net"
import { createConnection, createServer, Socket } from "net"
import { IConsensus } from "../../consensus/iconsensus"
import * as proto from "../../serialization/proto"
import { Server } from "../../server"
import { Hash } from "../../util/hash"
import { INetwork } from "../inetwork"
import { IPeer } from "../ipeer"
import { NatUpnp } from "../nat"
import { PeerDb } from "../peerDb"
import { UpnpClient, UpnpServer } from "../upnp"
import { PeerList } from "./peerList"
import { RabbitPeer } from "./rabbitPeer"
import { SocketParser } from "./socketParser"
// tslint:disable-next-line:no-var-requires
const delay = require("delay")
const logger = getLogger("Network")
// tslint:disable-next-line:no-var-requires
const randomInt = require("random-int")
export class RabbitNetwork implements INetwork {
    public static socket2Ipeer(socket: Socket): proto.IPeer {
        return proto.Peer.create({
            failCount: 0,
            host: socket.remoteAddress,
            lastSeen: Date.now(),
            port: socket.remotePort,
        })
    }
    public static string2key(host: string, port: number): Buffer {
        const hash: any = Hash.hash(host + port.toString()) // TS typechecking is incorrect
        return Buffer.from(hash).slice(0, 4)
    }
    public readonly port: number
    private hycon: Server
    private server: net.Server
    private targetPeerCount: number
    private peerDB: PeerDb
    private peerTable: Map<Buffer, RabbitPeer>
    private upnpServer: UpnpServer
    private upnpClient: UpnpClient
    private natUpnp: NatUpnp

    constructor(hycon: Server, port: number = 8148) {
        this.port = port
        this.targetPeerCount = 3
        this.hycon = hycon
        this.peerTable = new Map<Buffer, RabbitPeer>()
        logger.debug(`TcpNetwork Port=${port}`)
    }

    public broadcast(packet: Buffer, exempt: RabbitPeer): void {
        for (const [key, peer] of this.peerTable) {
            if (exempt !== peer) {
                peer.sendPacket(packet)
            }
        }
    }
    public async start(): Promise<boolean > {
        logger.debug(`Tcp Network Started`)
        this.server = createServer((socket) => this.accept(socket))
        await new Promise<boolean>((resolve, reject) => {
            this.server.once("error", reject)
            this.server.listen(this.port, () => {
                logger.info(`Listening ${this.port}`)
                resolve()
            })
        })

        this.server.on("error", (error) => logger.error(`${error}`))
        setInterval(() => logger.debug(`Peers Count=${this.peerTable.size}`), 5000)
        setInterval(() => { this.findPeers() }, 4000)

        // upnp
        this.upnpServer = new UpnpServer(this.port, this.hycon)
        this.upnpClient = new UpnpClient(this, this.hycon)
        // nat
        this.natUpnp = new NatUpnp(this.port, this)

        return true
    }

    public getRandomPeer(): IPeer {

    }
    public getRandomPeers(count: number = 1): IPeer[] {

    }

    public async connect(host: string, port: number): Promise < IPeer > {
        return new Promise<IPeer>((resolved, reject) => {
            const key = RabbitNetwork.string2key(host, port)
            if (this.peerTable.has(key)) {
                reject(`${host}:${port} Already Exists`)
            }
            logger.info(`Attempting to connect to ${host}:${port}`)
            const socket = new Socket()
            socket.once("error", reject)
            socket.connect({ host, port }, () => {
                logger.info(`Connected to ${host}:${port}`)
                const ipeer = RabbitNetwork.socket2Ipeer(socket)
                const peer = this.newConnection(key, socket, ipeer)
                resolved(peer)
            })
        })
    }

    private accept(socket: Socket) {
        const ipeer = RabbitNetwork.socket2Ipeer(socket)
        const key = PeerDb.peer2key(ipeer)
        if (this.peerTable.has(key)) {
            socket.destroy()
            socket.unref()
        } else {
            this.newConnection(key, socket, ipeer)
        }
    }

    private newConnection(key: Buffer, socket: Socket, ipeer: proto.IPeer): RabbitPeer {
        const peer = new RabbitPeer(socket, this, this.hycon.consensus, this.hycon.txPool)
        this.peerTable.set(key, peer)
        this.peerDB.put(ipeer)
        socket.on("close", (error) => {
            this.peerTable.delete(key)
            this.peerDB.remove(key)
        })
        socket.on("error", (error) => {
            logger.error(`Connection error ${socket.remoteAddress}:${socket.remotePort} : ${error}`)
        })

        peer.onConnected()
        return peer
    }

    private async findPeers() {
        const necessaryPeers = this.targetPeerCount - this.peerTable.size
        if (necessaryPeers <= 0) {
            return
        }
        // logger.debug(`Connect to Bootnodes For More Peers=${necessaryPeers}`)
        await delay(2000)
        // logger.debug(`Done`)
    }

}
