import { getLogger } from "log4js"
import * as Long from "long"
import { Address } from "../common/address"
import { PublicKey } from "../common/publicKey"
import * as proto from "../serialization/proto"
export class GenesisTx implements proto.ITx {
    public to: Address
    public amount: Long

    constructor(tx?: proto.ITx) {
        if (tx) { this.set(tx) }
    }

    public set(tx: proto.ITx) {
        if (tx.to === undefined) {
            throw new Error("to address not defined in input")
        }
        if (tx.amount === undefined) {
            throw new Error("amount not defined in input")
        }

        this.to = new Address(tx.to)
        this.amount = tx.amount instanceof Long ? tx.amount : Long.fromNumber(tx.amount * 10 ** 9, true)
    }

    public equals(tx: GenesisTx): boolean {
        if (!this.to.equals(tx.to)) { return false }
        if (this.amount !== tx.amount) { return false }
        return true
    }
    public encode(): Uint8Array {
        return proto.Tx.encode(this).finish()
    }
}
