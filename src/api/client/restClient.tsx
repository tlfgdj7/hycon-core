import { } from "es6-promise/auto"
import {
    IBlock,
    IHyconWallet,
    ILocationDetails,
    IPeer,
    IResponseError,
    IRest,
    ITxProp,
    IUser,
    IWalletAddress,
} from "./rest"
import { WalletDetail } from "./walletDetail"
// tslint:disable:no-console
// tslint:disable:ban-types
// tslint:disable:object-literal-sort-keys
export class RestClient implements IRest {

    public apiVersion = "v1"
    public loading: boolean
    public isHyconWallet: boolean
    public callback: (loading: boolean) => void
    public hyconWalletCallback: (isHyconWallet: boolean) => void

    public loadingListener(callback: (loading: boolean) => void): void {
        this.callback = callback
    }
    public setLoading(loading: boolean): void {
        this.loading = loading
        this.callback(this.loading)
    }

    public hyconWalletListener(
        hyconWalletCallback: (isHyconWallet: boolean) => void,
    ): void {
        this.hyconWalletCallback = hyconWalletCallback
    }
    public setIsHyconWallet(isHyconWallet: boolean): void {
        this.isHyconWallet = isHyconWallet
        this.hyconWalletCallback(this.isHyconWallet)
    }

    public createNewWallet(meta: IHyconWallet): Promise<IHyconWallet | IResponseError> {
        const headers = new Headers()
        headers.append("Accept", "application/json")
        headers.append("Content-Type", "application/json")
        return Promise.resolve(fetch(`/api/${this.apiVersion}/wallet`, {
            method: "POST",
            headers,
            body: JSON.stringify(meta),
        })
            .then((response) => response.json())
            .catch((err: Error) => {
                console.log(err)
            }))
    }

    public getWalletBalance(address: string): Promise<{ balance: string } | IResponseError> {
        return Promise.resolve(
            fetch(`/api/${this.apiVersion}/wallet/${address}/balance`)
                .then((response) => response.json())
                .catch((err: Error) => {
                    console.log(err)
                }),
        )
    }

    public getWalletTransactions(address: string, nonce?: number): Promise<{ txs: ITxProp[] } | IResponseError> {
        return Promise.resolve(
            fetch(`/api/${this.apiVersion}/wallet/${address}/txs/${nonce}`)
                .then((response) => response.json())
                .catch((err: Error) => {
                    console.log(err)
                }),
        )
    }

    public outgoingSignedTx(tx: { privateKey: string, from: string, to: string, amount: string, fee: string }, queueTx?: Function): Promise<{ txHash: string } | IResponseError> {
        const headers = new Headers()
        headers.append("Accept", "application/json")
        headers.append("Content-Type", "application/json")
        return Promise.resolve(fetch(`/api/${this.apiVersion}/signedtx`, {
            method: "POST",
            headers,
            body: JSON.stringify({ privateKey: tx.privateKey, from: tx.from, to: tx.to, amount: tx.amount, fee: tx.fee }),
        })
            .then((response) => response.json())
            .catch((err: Error) => {
                console.log(err)
            }))
    }

    public outgoingTx(tx: { signature: string, from: string, to: string, amount: string, fee: string, recovery: number }, queueTx?: Function): Promise<{ txHash: string } | IResponseError> {
        const headers = new Headers()
        headers.append("Accept", "application/json")
        headers.append("Content-Type", "application/json")
        return Promise.resolve(fetch(`/api/${this.apiVersion}/tx`, {
            method: "POST",
            headers,
            body: JSON.stringify({ signature: tx.signature, from: tx.from, to: tx.to, amount: tx.amount, fee: tx.fee, recovery: tx.recovery }),
        })
            .then((response) => response.json())
            .catch((err: Error) => {
                console.log(err)
            }))
    }

    public deleteWallet(name: string): Promise<boolean> {
        return Promise.resolve(
            fetch(`/api/${this.apiVersion}/deleteWallet/${name}`)
                .then((response) => response.json())
                .catch((err: Error) => {
                    console.log(err)
                }),
        )
    }

    public generateWallet(Hwallet: IHyconWallet): Promise<string> {
        const headers = new Headers()
        headers.append("Accept", "application/json")
        headers.append("Content-Type", "application/json")
        return Promise.resolve(fetch(`/api/${this.apiVersion}/generateWallet`, {
            method: "POST",
            headers,
            body: JSON.stringify(Hwallet),
        })
            .then((response) => response.json())
            .catch((err: Error) => {
                console.log(err)
            }))
    }
    public getAddressInfo(address: string): Promise<IWalletAddress> {
        const apiVer = this.apiVersion
        return Promise.resolve(
            fetch(`/api/${apiVer}/address/${address}`)
                .then((response) => response.json())
                .catch((err: Error) => {
                    console.log(err)
                }),
        )
    }
    public getAllAccounts(name: string): Promise<{ represent: number, accounts: Array<{ address: string, balance: string }> } | boolean> {
        return Promise.resolve(
            fetch(`/api/${this.apiVersion}/getAllAccounts/${name}`)
                .then((response) => response.json())
                .catch((err: Error) => {
                    console.log(err)
                }),
        )
    }
    public getBlock(hash: string): Promise<IBlock> {
        return Promise.resolve(
            fetch(`/api/${this.apiVersion}/block/${hash}`)
                .then((response) => response.json())
                .catch((err: Error) => {
                    console.log(err)
                }),
        )
    }
    public getBlockList(): Promise<IBlock[]> {
        return Promise.resolve(
            fetch(`/api/${this.apiVersion}/blockList`)
                .then((response) => response.json())
                .catch((err: Error) => {
                    console.log(err)
                }),
        )
    }
    public getLanguage(): Promise<string[]> {
        return Promise.resolve(
            fetch(`/api/${this.apiVersion}/language`)
                .then((response) => response.json())
                .catch((err: Error) => {
                    console.log(err)
                }),
        )
    }
    public getMnemonic(lang: string): Promise<string> {
        console.log(lang.toLowerCase())
        return Promise.resolve(
            fetch(`/api/${this.apiVersion}/getMnemonic/${lang.toLowerCase()}`)
                .then((response) => response.json())
                .catch((err: Error) => {
                    console.log(err)
                }),
        )
    }
    public getTx(hash: string): Promise<ITxProp> {
        return Promise.resolve(
            fetch(`/api/${this.apiVersion}/tx/${hash}`)
                .then((response) => response.json())
                .catch((err: Error) => {
                    console.log(err)
                }),
        )
    }
    public getWalletDetail(name: string): Promise<IHyconWallet> {
        return Promise.resolve(
            fetch(`/api/${this.apiVersion}/wallet/${name}`)
                .then((response) => response.json())
                .catch((err: Error) => {
                    console.log(err)
                }),
        )
    }
    public getWalletList(): Promise<IHyconWallet[]> {
        return Promise.resolve(
            fetch(`/api/${this.apiVersion}/wallet`)
                .then((response) => response.json())
                .catch((err: Error) => {
                    console.log(err)
                }),
        )
    }

    public recoverWallet(Hwallet: IHyconWallet): Promise<string | boolean> {
        const headers = new Headers()
        headers.append("Accept", "application/json")
        headers.append("Content-Type", "application/json")
        return Promise.resolve(fetch(`/api/${this.apiVersion}/recoverWallet`, {
            method: "POST",
            headers,
            body: JSON.stringify(Hwallet),
        })
            .then((response) => response.json())
            .catch((err: Error) => {
                console.log(err)
            }))
    }
    public sendTx(tx: { name: string, password: string, address: string, amount: number, minerFee: number }, queueTx?: Function): Promise<boolean> {
        console.log(tx.name)
        const headers = new Headers()
        headers.append("Accept", "application/json")
        headers.append("Content-Type", "application/json")
        return Promise.resolve(fetch(`/api/${this.apiVersion}/transaction`, {
            method: "POST",
            headers,
            body: JSON.stringify({ name: tx.name, password: tx.password, address: tx.address, amount: tx.amount, minerFee: tx.minerFee }),
        })
            .then((response) => response.json())
            .catch((err: Error) => {
                console.log(err)
            }))
    }

    public getPendingTxs(): Promise<ITxProp[]> {
        return Promise.resolve(
            fetch(`/api/${this.apiVersion}/txPool`)
                .then((response) => response.json())
                .catch((err: Error) => {
                    console.log(err)
                }),
        )
    }

}