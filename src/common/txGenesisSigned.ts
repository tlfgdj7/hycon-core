
import Long = require("long")
import * as proto from "../serialization/proto"
import { Hash } from "../util/hash"
import { Address } from "./address"
import { PublicKey } from "./publicKey"
import { GenesisTx } from "./txGenesis"

export class GenesisSignedTx implements proto.ITx {
    public static decode(data: Uint8Array): GenesisSignedTx {
        const genesisStx = proto.Tx.decode(data)
        return new GenesisSignedTx(genesisStx)
    }
    public to: Address
    public amount: Long
    public signature: Buffer
    public recovery: number

    constructor(tx?: proto.ITx, signature?: Uint8Array, recovery?: number) {
        if (tx) {
            if (signature !== undefined) {
                if (tx.signature === undefined) {
                    tx.signature = signature
                } else { throw new Error("Two signature information exists.") }
            }
            if (recovery !== undefined) {
                if (tx.recovery === undefined) {
                    tx.recovery = recovery
                } else { throw new Error("Two recovery information exists.") }
            }
            this.set(tx)
        }
    }

    /**
     * @deprecated Use new Hash(tx)
     */
    public unsignedHash(): Hash {
        return new Hash(this)
    }

    public set(stx: proto.ITx): void {
        if (stx.to === undefined) { throw (new Error("to address not defined in input")) }
        if (stx.amount === undefined) { throw (new Error("amount not defined in input")) }
        if (stx.signature === undefined) { throw (new Error("signature not defined in input")) }
        if (stx.recovery === undefined) { throw (new Error("recovery not defined in input")) }

        this.to = new Address(stx.to)
        this.amount = stx.amount instanceof Long ? stx.amount : Long.fromNumber(stx.amount * 10 ** 9, true)
        this.signature = new Buffer(stx.signature)
        this.recovery = stx.recovery
    }

    public verify(): boolean {
        try {
            const pubkey = new PublicKey(this)
            return pubkey.verify(this)
        } catch (e) {
            return false
        }
    }

    public encode(): Uint8Array {
        return proto.Tx.encode(this).finish()
    }
}
