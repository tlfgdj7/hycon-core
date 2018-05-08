import * as bip39 from "bip39"
import blake2b = require("blake2b")
import * as crypto from "crypto"
import * as fs from "fs-extra"
import { getLogger } from "log4js"
import secp256k1 = require("secp256k1")
import { HDKey } from "wallet.ts"
import { Address } from "../common/address"
import { PrivateKey } from "../common/privateKey"
import { PublicKey } from "../common/publicKey"
import { Tx } from "../common/tx"
import { SignedTx } from "../common/txSigned"
import * as proto from "../serialization/proto"
import {
    CHINESE_SIMPLIFIED_WORDLIST,
    CHINESE_TRADITIONAL_WORDLIST,
    ENGLISH_WORDLIST,
    FRENCH_WORDLIST,
    ITALIAN_WORDLIST,
    JAPANESE_WORDLIST,
    KOREAN_WORDLIST,
    SPANISH_WORDLIST,
} from "./mnemonic"

const logger = getLogger("Wallet")

const coinNumber: number = 1397
export class Wallet {
    public static async walletInit(): Promise<undefined> {
        try {
            await fs.ensureDir("./wallet/rootKey")
        } catch (e) {
            try {
                await fs.mkdir("./wallet")
            } catch (error) {
                logger.error(`Make Directory fail : ${error}`)
                return Promise.reject(error)
            }
        }
        return Promise.resolve(undefined)
    }

    public static randomWallet(): Wallet {
        const privateKey = new PrivateKey()
        return new Wallet(privateKey)
    }

    public static generate(wallet?: {
        name: string,
        password: string,
        mnemonic: string,
        language: string,
        hint: string,
    }): Wallet {
        if (wallet && wallet.mnemonic) {
            let language = ""
            if (!wallet.language) {
                language = "english"
            } else {
                language = wallet.language
            }
            return Wallet.generateKeyWithMnemonic(wallet.mnemonic, language.toLowerCase(), wallet.password)
        } else {
            return Wallet.generateKey()
        }
    }

    public static generateKey(): Wallet {
        return Wallet.generateKeyWithMnemonic(Wallet.getRandomMnemonic("english"))
    }

    public static validateMnemonic(mnemonic: string, language: string): boolean {
        return bip39.validateMnemonic(mnemonic, Wallet.getWordList(language))
    }

    public static generateKeyWithMnemonic(
        mnemonic: string,
        language: string = "english",
        passphrase?: string,
        index: number = 0,
    ): Wallet {
        if (!Wallet.validateMnemonic(mnemonic, language)) {
            logger.error("invalid mnemonic or language in validateMnemonic()")
            throw new Error("mnemonic or language is invalid/mismatched")
        }

        const seed: Buffer = bip39.mnemonicToSeed(mnemonic, passphrase)
        const masterKey = HDKey.parseMasterSeed(seed)
        const derived = masterKey.derive(`m/44'/${coinNumber}'/0'/0`)
        if (!derived.extendedPrivateKey || !masterKey.extendedPrivateKey) {
            logger.error("Extended PrivateKey does not have privateKey")
            throw new Error("Extended PrivateKey does not have privateKey")
        }

        const child = HDKey.parseExtendedKey(derived.extendedPrivateKey)
        const wallet = child.derive(`${index}`)
        if (!wallet.privateKey) {
            logger.error("Not much key information to save wallet")
            throw new Error("Not much key information to save wallet")
        }

        if (!secp256k1.privateKeyVerify(wallet.privateKey)) {
            logger.error("Fail to privateKeyVerify in generate Key with mnemonic")
            throw new Error("Fail to privateKeyVerify in generate Key with mnemonic")
        }

        if (!(Wallet.checkPublicKey(wallet.publicKey, wallet.privateKey))) {
            logger.error("publicKey from masterKey generated by hdkey is not equal publicKey generated by secp256k1")
            throw new Error("publicKey from masterKey generated by hdkey is not equal publicKey generated by secp256k1")
        }

        return new Wallet(wallet.privateKey, wallet.publicKey)
    }

    public static checkPublicKey(publicKey: Buffer, privateKey: Buffer): boolean {
        let isEqual = true
        const secpPublicKey = secp256k1.publicKeyCreate(privateKey)
        if (publicKey.length !== secpPublicKey.length) {
            isEqual = false
        } else {
            for (let i = 0; i < publicKey.length; i++) {
                if (publicKey[i] !== secpPublicKey[i]) {
                    isEqual = false
                    break
                }
            }
        }
        return isEqual
    }
    public static getRandomMnemonic(language: string = "english"): string {
        return bip39.generateMnemonic(128, undefined, Wallet.getWordList(language))
    }

    public static getWordList(language: string): string[] {
        let returnWordList
        switch (language) {
            case "english":
                returnWordList = ENGLISH_WORDLIST
                break
            case "korean":
                returnWordList = KOREAN_WORDLIST
                break
            case "chinese_simplified":
                returnWordList = CHINESE_SIMPLIFIED_WORDLIST
                break
            case "chinese_traditional":
                returnWordList = CHINESE_TRADITIONAL_WORDLIST
                break
            case "french":
                returnWordList = FRENCH_WORDLIST
                break
            case "italian":
                returnWordList = ITALIAN_WORDLIST
                break
            case "japanese":
                returnWordList = JAPANESE_WORDLIST
                break
            case "spanish":
                returnWordList = SPANISH_WORDLIST
                break
            case "chinese":
                throw new Error("Did you mean chinese_simplified or chinese_traditional?")
            default:
                returnWordList = ENGLISH_WORDLIST
                break

        }
        return returnWordList
    }
    public static encryptAES(password: string, data: string): string {
        const iv = crypto.randomBytes(16)
        const key = new Buffer(32)
        blake2b(32).update(Buffer.from(password)).digest(key)
        const cipher = crypto.createCipheriv("aes-256-cbc", key, iv)
        const dataBuffer = Buffer.from(data)
        const encryptedData1 = cipher.update(dataBuffer)
        const encryptedData2 = cipher.final()
        const encryptedData = Buffer.concat([encryptedData1, encryptedData2])
        const encrtypedDataWithIV = iv.toString("hex") + ":" + encryptedData.toString("hex")
        return encrtypedDataWithIV
    }

    public static decryptAES(password: string, rawBufferData: Buffer): string {
        const rawData = rawBufferData.toString()
        const stringArray = rawData.split(":")
        const iv = new Buffer(stringArray[0], "hex")
        const encryptedData = new Buffer(stringArray[1], "hex")
        const key = new Buffer(32)
        blake2b(32).update(Buffer.from(password)).digest(key)
        const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv)
        const originalData1 = decipher.update(encryptedData)
        const originalData2 = decipher.final()
        const originalData = Buffer.concat([originalData1, originalData2])
        return originalData.toString()
    }

    public static async loadKeys(name: string, password: string): Promise<Wallet> {
        try {
            const rawRootKey = await fs.readFile(`./wallet/rootKey/${name}`)
            const decrypteResult = Wallet.decryptAES(password, rawRootKey)
            const privateKeyBuffer = new Buffer(decrypteResult, "hex")
            return new Wallet(privateKeyBuffer)
        } catch (e) {
            logger.error("Fail to loadKeys : " + e)
            return Promise.reject("Fail to loadKeys : " + e)
        }
    }

    public static async getAddress(name: string): Promise<string> {
        try {
            const walletList = await Wallet.getAllPubliclist()
            for (const wallet of walletList) {
                if (wallet.name === name) {
                    return wallet.address
                }
            }
            return Promise.reject("Could not find this wallet's address")
        } catch (e) {
            logger.error("Fail to get AddressList")
            return Promise.reject("Fail to get AddressList")
        }
    }

    public static async recoverWallet(
        recoveryParamets: {
            name: string,
            password: string,
            mnemonic: string,
            language: string,
            hint: string,
        }):
        Promise<string> {
        try {
            if (await fs.pathExists(`./wallet/rootKey/${recoveryParamets.name}`)) {
                return Promise.reject("Duplicate wallet name...")
            }
            const wallet = Wallet.generate(recoveryParamets)
            await wallet.save(recoveryParamets.name, recoveryParamets.password)
            const addressString = await Wallet.getAddress(recoveryParamets.name)
            return Promise.resolve(addressString.toString())
        } catch (e) {
            logger.error("Error while recoverWallet : " + e)
            return Promise.reject("Error while recoverWallet : " + e)
        }
    }

    public static async getAllPubliclist(): Promise<Array<{ name: string, address: string }>> {
        const listArray: Array<{ name: string, address: string }> = []
        try {
            await fs.ensureFile("./wallet/public")
            const fileData = await fs.readFile("./wallet/public")
            const walletList = fileData.toString().split(",")
            for (const wallet of walletList) {
                const stringTmp = wallet.split(":")
                if (stringTmp.length >= 2) {
                    listArray.push({ name: stringTmp[0], address: stringTmp[1] })
                }
            }
            return Promise.resolve(listArray)
        } catch (e) {
            logger.error(`Fail to getAllPubliclist : ${e}`)
            return Promise.reject(e)
        }

    }

    public static async walletList(): Promise<Array<{ name: string, address: string }>> {
        try {
            const rootKeyList = await fs.readdir("./wallet/rootKey")
            const walletList: Array<{ name: string, address: string }> = []
            for (const rootKey of rootKeyList) {
                const address = await Wallet.getAddress(rootKey)
                walletList.push({ name: rootKey, address: address.toString() })
            }
            return Promise.resolve(walletList)
        } catch (e) {
            logger.error(`Fail to walletList : ${e}`)
            return Promise.reject(e)
        }
    }

    public static async getLang(): Promise<string[]> {
        let lst: string[] = []
        const languageList: string[] = []
        try {
            lst = await fs.readdir("./mnemonic/")
            if (lst) {
                for (let i = 0; i < lst.length; i++) {
                    if (lst[i].search(".json") > -1) {
                        lst[i] = lst[i].replace(".json", "")
                        languageList.push(lst[i])
                    }
                }
            }
            return Promise.resolve(languageList)
        } catch (e) {
            logger.error(`Fail to getLanguages : ${e}`)
            return Promise.reject(e)
        }
    }

    public static async delete(name: string): Promise<boolean> {
        try {
            if (await fs.pathExists(`./wallet/rootKey/${name}`)) {
                const walletList = await Wallet.getAllPubliclist()
                const writeList: string[] = []
                for (const wallet of walletList) {
                    if (wallet.name === name) {
                        continue
                    }
                    writeList.push(`${wallet.name}:${wallet.address},`)
                }
                await fs.unlink(`./wallet/rootKey/${name}`)
                await fs.writeFile("./wallet/public", writeList)
                return Promise.resolve(true)
            } else {
                logger.warn("Root key file not existed... ")
                return Promise.resolve(false)
            }
        } catch (e) {
            logger.error(`Fail to delete wallet : ${e}`)
            return Promise.reject(e)
        }
    }

    public readonly privKey: PrivateKey
    public readonly pubKey: PublicKey

    constructor(privateKey: (Buffer | PrivateKey), publicKeyBuffer?: Buffer) {
        this.privKey = privateKey instanceof Buffer ? new PrivateKey(privateKey) : privateKey
        this.pubKey = (publicKeyBuffer === undefined) ? this.privKey.publicKey() : new PublicKey(publicKeyBuffer)
    }

    public async save(name: string, password: string): Promise<undefined> {
        try {
            const walletExist = await fs.existsSync(`./wallet/rootKey/${name}`)
            if (!walletExist) {
                const encryptedPrivateKey = Wallet.encryptAES(password, this.privKey.privKey.toString("hex"))
                await fs.writeFile(`./wallet/rootKey/${name}`, encryptedPrivateKey)
                try {
                    await fs.ensureFile("./wallet/public")
                    const originalData = await Wallet.getAllPubliclist()
                    const dataArray: string[] = []

                    originalData.push({ name, address: this.pubKey.address().toString() })
                    originalData.sort((a, b) => a.name.charCodeAt(0) - b.name.charCodeAt(0))

                    for (const data of originalData) {
                        dataArray.push(`${data.name}:${data.address}`)
                    }
                    await fs.writeFile("./wallet/public", dataArray)
                } catch (e) {
                    logger.error(`Address file not exsited : ${e}`)
                    return Promise.reject(e)
                }
                return Promise.resolve(undefined)
           } else {
               return Promise.reject(`Wallet is already exist : name=${name}`)
           }
        } catch (e) {
            logger.error(`Fail to save wallet ${e}`)
            return Promise.reject(e)
        }

    }

    public send(to: Address, amount: number, nonce: number, fee?: number): SignedTx {
        const from = this.pubKey.address()
        const tx = new Tx({ from, to, amount, fee, nonce })
        const stx = this.privKey.sign(tx)
        if (!(stx instanceof SignedTx)) {
            logger.error(`Sign method did not return SignedTx`)
            throw (new Error("sign method did not return SignedTx"))
        }
        return stx
    }
}
