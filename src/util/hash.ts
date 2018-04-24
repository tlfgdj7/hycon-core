import { Block } from "../common/block"
import { AnyBlockHeader, BaseBlockHeader, BlockHeader, GenesisBlockHeader } from "../common/blockHeader"
import { Tx } from "../common/tx"
import { GenesisTx } from "../common/txGenesis"
import { GenesisSignedTx } from "../common/txGenesisSigned"
import { SignedTx } from "../common/txSigned"
import { Account } from "../consensus/account"
import { StateNode } from "../consensus/stateNode"
import * as proto from "../serialization/proto"

import Base58 = require("base-58")
import blake2b = require("blake2b")
// tslint:disable-next-line:no-var-requires
const cryptonight = require("node-cryptonight").asyncHash

// tslint:disable-next-line:max-line-length
function toUint8Array(ob?: Tx | Block | GenesisBlockHeader | BlockHeader | string | Uint8Array | SignedTx | GenesisTx | GenesisSignedTx | StateNode | Account) {
    if (ob !== undefined) {
        if (typeof ob === "string") {
            return Hash.hash(ob)
        } else if (ob instanceof Uint8Array) {
            if (ob.length !== 32) {
                throw new Error(`Hash length ${ob.length} but should be 32`)
            }
            return ob
            // tslint:disable-next-line:max-line-length
        } else if (ob instanceof Tx || ob instanceof BlockHeader || ob instanceof BaseBlockHeader || ob instanceof Block || ob instanceof SignedTx || ob instanceof StateNode || ob instanceof Account || ob instanceof GenesisBlockHeader || ob instanceof GenesisTx || ob instanceof GenesisSignedTx) {
            return Hash.hash(ob.encode())
        }
        return Hash.hash(ob)
    }
    return Hash.emptyHash()
}

export class Hash extends Uint8Array {
    public static emptyHash(): Uint8Array {
        return blake2b(32).digest()
    }

    public static hash(ob: Uint8Array | string): Uint8Array {
        typeof ob === "string" ? ob = Buffer.from(ob) : ob = ob
        return blake2b(32).update(ob).digest()
    }

    public static async hashCryptonight(ob: Uint8Array | string): Promise<Uint8Array> {
        return new Promise<Uint8Array>((resolve: any, reject: any) => {
            if (typeof ob === "string") {
                cryptonight(Buffer.from(ob), (hash: any) => {
                    return resolve(new Uint8Array(hash))
                })
            } else {
                cryptonight(ob, (hash: any) => {
                    return resolve(new Uint8Array(hash))
                })
            }
        })
    }

    public static decode(str: string): Hash {
        return new Hash(Base58.decode(str))
    }

    // tslint:disable-next-line:max-line-length
    constructor(ob?: Tx | Block | GenesisBlockHeader | BlockHeader | string | Uint8Array | SignedTx | GenesisTx | GenesisSignedTx | StateNode | Account) {
        super(toUint8Array(ob))
    }

    public toString(): string {
        return Base58.encode(this)
    }

    public toHex() {
        return Buffer.from(this.buffer).toString("hex")
    }

    public toBuffer(): Buffer {
        return Buffer.from(this.buffer)
    }

    public equals(other: Hash): boolean {
        if (this.length !== other.length) { return false }
        for (let i = 0; i < other.length; i++) {
            if (this[i] !== other[i]) {
                return false
            }
        }
        return true
    }
}
