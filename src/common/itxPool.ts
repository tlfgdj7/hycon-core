import { SignedTx } from "./txSigned"

type TopTxCallback = (txs: SignedTx[]) => void // TODO: define type
export interface ITxPool {
    putTxs(txs: SignedTx[]): number
    updateTxs(old: SignedTx[], maxReturn?: number): SignedTx[]
    onTopTxChanges(count: number, callback: TopTxCallback): void
    getPending(index: number, count: number): { txs: SignedTx[], length: number, totalAmount: Long, totalFee: Long }
}
