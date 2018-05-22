import Long = require("long")
import * as React from "react"
import { IBlock, IRest } from "./rest"
import { TxList } from "./txList"
import { hyconfromString, hycontoString } from "./util/commonUtil"
interface IBlockProps {
    rest: IRest
    hash: string
}

interface IBlockViewState {
    rest: IRest
    block?: IBlock
    hash: string
    amount?: string
    fees?: string
    volume?: string
    prevBlock?: string
    resultHash?: string
}
export class BlockView extends React.Component<IBlockProps, IBlockViewState> {
    public mounted: boolean = false
    constructor(props: IBlockProps) {
        super(props)
        this.state = { hash: props.hash, rest: props.rest }
    }
    public componentWillUnmount() {
        this.mounted = false
    }
    public componentWillMount() {
        this.mounted = true
        this.state.rest.setLoading(true)
        this.state.rest.getBlock(this.state.hash).then((data: IBlock) => {
            let amount = Long.fromInt(0)
            let fees = Long.fromInt(0)
            for (const tx of data.txs) {
                amount = amount.add(hyconfromString(tx.amount))
                if (tx.fee !== undefined) {
                    fees = fees.add(hyconfromString(tx.fee))
                }
            }
            const volume = amount.add(fees)
            this.state.rest.setLoading(false)
            if (this.mounted) {
                this.setState({
                    amount: hycontoString(amount),
                    block: data,
                    fees: hycontoString(fees),
                    prevBlock: data.prevBlock,
                    resultHash: data.resultHash,
                    volume: hycontoString(volume),
                })
            }
        })
    }
    public render() {
        if (this.state.block === undefined) {
            return < div ></div >
        }
        return (
            <div>
                <div className="contentTitle">Block #{this.state.block.height}</div>
                <table className="table_margined blockTable">
                    <thead>
                        <tr>
                            <th
                                colSpan={2}
                                className="tableBorder_Header tableHeader_floatLeft"
                            >
                                Summary
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td className="tdSubTitle subTitle_width20">Hash</td>
                            <td>{this.state.hash}</td>
                        </tr>
                        <tr>
                            <td className="tdSubTitle subTitle_width20">Previous Hash</td>
                            <td><a href={`/block/${this.state.prevBlock}`}>
                                {this.state.prevBlock}
                            </a>
                            </td>
                        </tr>
                        <tr>
                            <td className="tdSubTitle subTitle_width20">Result Hash</td>
                            <td>{this.state.resultHash}</td>
                        </tr>
                        <tr>
                            <td className="tdSubTitle subTitle_width20">Num of Txs</td>
                            <td>{this.state.block.txs.length}</td>
                        </tr>
                        <tr>
                            <td className="tdSubTitle subTitle_width20">Tx Volume</td>
                            <td>{this.state.volume}</td>
                        </tr>
                        <tr>
                            <td className="tdSubTitle subTitle_width20">Tx Transfer</td>
                            <td>{this.state.amount}</td>
                        </tr>
                        <tr>
                            <td className="tdSubTitle subTitle_width20">Tx Fees</td>
                            <td>{this.state.fees}</td>
                        </tr>
                    </tbody>
                </table>
                <TxList txs={this.state.block.txs} rest={this.state.rest} />
            </div>
        )
    }
}
