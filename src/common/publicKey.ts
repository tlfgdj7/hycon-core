import secp256k1 = require("secp256k1")
import { Hash } from "../util/hash"
import { Address } from "./address"
import { GenesisSignedTx } from "./txGenesisSigned"
import { SignedTx } from "./txSigned"

export class PublicKey {
    public readonly pubKey: Buffer

    constructor(pubKeySource: (SignedTx | GenesisSignedTx | Buffer)) {
        if (pubKeySource instanceof Buffer) {
            this.pubKey = pubKeySource
        } else {
            const hash = new Hash(pubKeySource)
            this.pubKey = secp256k1.recover(hash.toBuffer(), pubKeySource.signature, pubKeySource.recovery)
        }
    }

    public verify(tx: (SignedTx | GenesisSignedTx)): boolean {
        let txAddress: Address
        if (tx instanceof SignedTx) {
            txAddress = tx.from
        } else {
            txAddress = tx.to
        }
        const address = this.address()

        if (!txAddress.equals(address)) { return false }
        if (!tx.signature) { return false }

        try {
            const hash = new Hash(tx)
            return secp256k1.verify(hash.toBuffer(), tx.signature, this.pubKey)
        } catch (e) {
            return false
        }
    }

    public address(): Address {
        const hash: Uint8Array = Hash.hash(this.pubKey)
        const address = new Address(hash.slice(12))
        return address
    }
}
