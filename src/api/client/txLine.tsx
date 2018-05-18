import * as React from "react"
import { Link } from "react-router-dom"
import { IRest, ITxProp, IWalletAddress } from "./rest"
interface ITxLineProps {
    rest: IRest
    tx: ITxProp
    address?: IWalletAddress
}
interface ITxLineView {
    rest: IRest
    tx: ITxProp
    address?: IWalletAddress
}
export class TxLine extends React.Component<ITxLineProps, ITxLineView> {
    constructor(props: ITxLineProps) {
        super(props)
        this.state = { tx: props.tx, rest: props.rest, address: props.address ? props.address : undefined }
    }
    public render() {
        const date = new Date(Date.now())
        return (
            <table className="table_margined">
                <thead>
                    <tr>
                        <th colSpan={4} className="tableBorder_Header">
                            <Link to={`/tx/${this.state.tx.hash}`}>
                                <span className="coloredText">{this.state.tx.hash}</span>
                            </Link>
                            <span className="timeStampArea">
                                {date.getFullYear()}-{(Array(2 + 1).join("0") + (date.getMonth() + 1)).slice(-2)}-{(Array(2 + 1).join("0") + date.getDate()).slice(-2)}{" "}
                                {date.getHours()}:{date.getMinutes()}:{date.getSeconds()}
                            </span>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td className="coloredText tableDivision txAddrTd">
                            {this.state.tx.from ? (
                                <Link to={`/address/${this.state.tx.from}`}>
                                    {this.state.tx.from}
                                </Link>
                            ) : (
                                    <span className="NoFrom">No Inputs(Newly Generated Coins)</span>
                                )}
                        </td>
                        <td>
                            <i className="material-icons">forward</i>
                        </td>
                        <td className="coloredText tableDivision txAddrTd">
                            {this.state.tx.to ? (
                                <Link to={`/address/${this.state.tx.to}`}>
                                    {this.state.tx.to}
                                </Link>
                            ) : (
                                    <span className="CantDecode">
                                        Unable to decode output address
                </span>
                                )}
                        </td>
                        <td className="tableDivision amountTd">
                            {this.state.tx.amount + " HYCON"}
                        </td>
                    </tr>
                </tbody>
            </table>
        )
    }
}