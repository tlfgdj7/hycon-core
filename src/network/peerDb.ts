import levelup = require("levelup")
import { getLogger } from "log4js"
import Long = require("long")
import rocksdb = require("rocksdb")
import { AsyncLock } from "../common/asyncLock"
import * as proto from "../serialization/proto"
import { Hash } from "../util/hash"

const logger = getLogger("PeerDb")

export class PeerDb {
    public static ipeer2key(peer: proto.IPeer): number {
        const hash = new Hash(peer.host + "!" + peer.port.toString())
        let key = 0
        for (let i = 0; i < 6; i++) {
            // tslint:disable-next-line:no-bitwise
            key = key * 256 + hash[i]
        }
        return key
    }
    public static ipeer2value(peer: proto.IPeer): Buffer {
        const buf: any = proto.Peer.encode(peer).finish()// TS typechecking is incorrect
        const value = Buffer.from(buf)
        return value
    }
    private db: levelup.LevelUp // database
    private keys: number[]
    private keyListLock: AsyncLock// This lock protects this.keys from concurrent usage

    constructor(peerDbPath: string = "peerdb") {
        // Locked until this.keys is initialized
        const rocksDB: any = rocksdb(peerDbPath)// TODO: Fix levelup type declarartion
        this.db = levelup(rocksDB)
        const db: any = this.db // TODO: Fix levelup type declarartion
        this.initKeys()
    }

    public peerCount(): number {
        return this.keys.length
    }
    public async printDB() {
        let i = 1
        for (const key of this.keys) {
            const peer = await this.get(key)
            logger.info(`${i++}/${this.keys.length} host: ${peer.host}, port: ${peer.port}, failCount: ${peer.failCount}`)
        }
    }
    public async seen(peer: proto.IPeer) {
        const key = PeerDb.ipeer2key(peer)
        peer.lastSeen = Date.now()
        peer.failCount = 0
        logger.debug(`PeerDB saw ${peer.host}:${peer.port}`)
        return this.put(peer)
    }

    public async fail(peer: proto.IPeer, limit: number) {
        const key = PeerDb.ipeer2key(peer)
        const dbpeer = await this.get(key)
        if (dbpeer === undefined) {
            return
        }
        dbpeer.lastAttempt = Date.now()
        if (dbpeer.failCount === undefined) {
            dbpeer.failCount = 1
        } else {
            dbpeer.failCount++
        }

        logger.debug(`${peer.host}:${peer.port} failCount = ${dbpeer.failCount}`)

        if (dbpeer.failCount <= limit) {
            await this.put(dbpeer)
        } else {
            logger.debug(`${peer.host}:${peer.port} will be removed from the peerDB`)
            await this.remove(dbpeer)
        }
    }

    public async put(peer: proto.IPeer): Promise<proto.IPeer> {
        const key = PeerDb.ipeer2key(peer)
        const value = PeerDb.ipeer2value(peer)
        return this.keyListLock.critical<proto.IPeer>(async () => {
            try {
                await this.db.put(key, value)
                logger.debug(`Saved to db ${peer.host}:${peer.port}`)
                if (this.keys.indexOf(key) === -1) {
                    this.keys.push(key)
                }
                return peer
            } catch (e) {
                logger.debug(`Saving to db ${e}`)
            }
        })
    }

    public async get(key: number): Promise<proto.IPeer | undefined> {
        try {
            const result = await this.db.get(key)
            const peer = proto.Peer.decode(result)
            return peer
        } catch (e) {
            if (e.notFound) {
                return undefined
            }
            logger.debug(`Could not get key '${key}': ${e}`)
            throw e
        }
    }

    public async remove(peer: proto.IPeer): Promise<void> {
        const key = PeerDb.ipeer2key(peer)
        let index = this.keys.indexOf(key)
        return this.keyListLock.critical(async () => {
            await this.db.del(key)
            while (index !== -1) {
                this.keys.splice(index, 1)
                index = this.keys.indexOf(key)
            }
        })
    }

    public async getRandomPeer(connections: Map<number, proto.IPeer>): Promise<proto.IPeer | undefined> {
        return this.keyListLock.critical(async () => {
            let key: number
            const filtered = this.keys.filter((filterkey) => !connections.has(filterkey))
            if (filtered.length === 0) {
                return undefined
            }
            const index = Math.floor(filtered.length * Math.random())
            key = filtered[index]
            return await this.get(key)
        })
    }

    private async initKeys() {
        if (this.keyListLock !== undefined) {
            // The below initilizes keyListLock
            throw new Error("Trying to initialize keys after it has already been initialized")
        }
        try {
            this.keyListLock = new AsyncLock(true)
            this.keys = []
            await new Promise((resolve, reject) => {
                const stream = this.db.createKeyStream()
                    .on("data", async (key: Buffer) => {
                        const num = Number(key)
                        if (Number.isNaN(num)) {
                            logger.debug(`Peer db contains unexpected key '${key.toString()}'`)
                        } else {
                            this.keys.push(num)
                        }
                    })
                    .on("error", (e: any) => {
                        logger.debug(`Could not clear all elements from DB: ${e}`)
                        reject(e)
                    })
                    .on("end", () => {
                        resolve()
                    })
            })
        } catch (e) {
            logger.error(`Failed to init peer db keys: ${e}`)
        } finally {
            this.keyListLock.releaseLock()
        }
    }
}
