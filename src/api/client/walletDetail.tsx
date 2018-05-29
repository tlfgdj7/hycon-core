import { Dialog } from "material-ui"
import * as QRCode from "qrcode.react"
import * as React from "react"
import update = require("react-addons-update")
import * as CopyToClipboard from "react-copy-to-clipboard"
import * as ReactPaginate from "react-paginate"
import { Redirect } from "react-router"
import { Link } from "react-router-dom"
import { IHyconWallet, IRest, ITxProp } from "./rest"
import { TxLine } from "./txLine"
interface IWalletDetailProps {
    rest: IRest
    name: string
    wallet: IHyconWallet
    accounts: IHyconWallet[]
}
export class WalletDetail extends React.Component<any, any> {
    public msg1: string = "Are you sure delete your wallet?"
    public msg2: string = "Successfully deleted. You can recover deleted wallet anytime using mnemonic words."
    public msg3: string = "Fail to delete wallet"
    public msg4: string = "Fail to change account"
    public mounted: boolean = false
    constructor(props: any) {
        super(props)
        this.state = { name: props.name, rest: props.rest, visible: false, accounts: [], address: "", txs: [], hasMore: true }
    }
    public componentWillUnmount() {
        this.mounted = false
    }

    public componentDidMount() {
        this.mounted = true
        this.props.rest.setLoading(true)
        this.props.rest.getWalletDetail(this.state.name).then((data: IHyconWallet) => {
            this.state.rest.setLoading(false)
            if (this.mounted) {
                this.setState({ wallet: data, address: data.address, txs: data.txs })
            }
        }).catch((e: Error) => {
            alert(e)
        })
    }
    public handleSelectAccount(option: any) {
        this.setState({ represent: option.target.value })
    }
    public deleteWallet() {
        if (confirm(this.msg1)) {
            this.state.rest.deleteWallet(this.state.name).then((isDeleted: boolean) => {
                if (isDeleted === true) {
                    alert(this.msg2)
                    this.setState({ redirect: true })
                } else {
                    alert(this.msg3)
                }
            })
        }
    }
    public accountSelected() {
        this.state.rest.setLoading(true)
        this.state.rest.changeAccount(this.state.name, this.state.represent).then((isChanged: boolean) => {
            if (isChanged) {
                this.setState({ visible: false, wallet: undefined })
                this.state.rest.getWalletDetail(this.state.name).then((data: IHyconWallet) => {
                    this.state.rest.setLoading(false)
                    if (this.mounted) {
                        this.setState({ wallet: data })
                    }
                })
            } else {
                alert(this.msg4)
                this.setState({ visible: false })
                this.state.rest.setLoading(false)
            }
        })
    }
    public cancelDialog() {
        this.setState({ visible: false })
    }
    public searchAllAccounts() {
        this.state.rest.getAllAccounts(this.state.name).then((result: { represent: number, accounts: Array<{ address: string, balance: number }> } | boolean) => {
            if (typeof result === "boolean") { alert("Fail to load accounts information") } else {
                this.setState({ visible: true, accounts: result.accounts, represent: result.represent })
            }
        })
    }

    public transfer() {
        this.setState({ isTransfer: true })
    }
    public render() {
        let accountIndex = 0
        if (this.state.wallet === undefined) {
            return < div ></div >
        }
        if (this.state.redirect) {
            return <Redirect to="/wallet" />
        }
        if (this.state.isTransfer) {
            return <Redirect to={`/transaction/${this.state.name}`} />
        }
        return (
            <div>
                <table className="table_wallet_txs">
                    <thead>
                        <tr>
                            <td colSpan={2} className="walletDetailFunctionTd">
                                <button onClick={() => { this.transfer() }} className="mdl-button">
                                    <i className="material-icons">send</i>TRANSFER</button>
                                <button onClick={() => { this.deleteWallet() }} className="mdl-button">
                                    <i className="material-icons">delete</i>FORGET</button>
                                {/* <button className="mdl-button">
                                    <i className="material-icons">mode_edit</i>EDIT</button>
                                <button className="mdl-button">
                                    <i className="material-icons">settings</i>SETTING</button> */}
                            </td>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>
                                <i className="material-icons walletIcon_grey">account_balance_wallet</i>
                                <table className="walletTable_NameAddr">
                                    <tbody>
                                        <tr>
                                            <td className="walletNameTd">{this.state.name}
                                                <button onClick={() => { this.searchAllAccounts() }} className="mdl-button">
                                                    <i className="material-icons">find_replace</i></button>
                                            </td>
                                            <td>
                                                <span className="mdl-chip mdl-chip--contact balanceInfo">
                                                    <span className="mdl-chip__contact mdl-color--teal mdl-color-text--white">H</span>
                                                    <span className="mdl-chip__text">
                                                        {this.state.wallet.balance}
                                                    </span>
                                                </span>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td colSpan={2}>
                                                <button className="mdl-button flaotLeft copyBtn">
                                                    <CopyToClipboard text={this.state.wallet.address} onCopy={() => this.setState({ copied: true })} >
                                                        <span>
                                                            <i className="material-icons">content_copy</i>
                                                        </span>
                                                    </CopyToClipboard>
                                                </button>
                                                <div className="flaotLeft addressDiv">
                                                    {this.state.wallet.address}
                                                </div>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                                <span className="QRCodeInWalletDetail">
                                    <QRCode size={120} value={this.state.wallet.address} />
                                </span>
                            </td>
                            <td />
                        </tr>
                    </tbody>
                </table>
                {this.state.txs.map((tx: ITxProp) => {
                    return (
                        <div key={accountIndex++}>
                            <TxLine tx={tx} rest={this.state.rest} />
                            {tx.from === this.state.address ?
                                (<button className="mdl-button mdl-js-button mdl-button--raised mdl-button--accent txAmtBtn">-{tx.estimated} HYCON</button>)
                                :
                                (<button className="mdl-button mdl-js-button mdl-button--raised mdl-button--colored txAmtBtn">{tx.amount} HYCON</button>)}
                        </div>
                    )
                })}
                {this.state.hasMore && this.state.txs.length > 0 ?
                    (<div><button className="btn btn-block btn-info" onClick={() => this.fetchNextTxs()}>Load more</button></div>)
                    :
                    (<div></div>)}
                <Dialog className="dialog" open={this.state.visible}>
                    <h4 className="contentTitle">Select account to use.</h4>
                    <div className="mdl-dialog__content accountDialogContent">
                        <p>List of currently available accounts. To add a new account, please click the 'New Account' button below.</p>
                    </div>
                    <div className="accountList">
                        <form className="leftAlignForm">
                            {this.state.accounts.map((account: { address: string, balance: number }) => {
                                const key = accountIndex + 1
                                return (
                                    <div key={key}>
                                        <label className="displayBlock">
                                            <input type="radio" name="account" value={key}
                                                checked={this.state.represent === key ? true : false}
                                                onChange={(option) => { this.handleSelectAccount(option) }} />
                                            <span> {account.address}</span> <span className="balanceOfAccount">{account.balance} HYC</span>
                                        </label>
                                    </div>
                                )
                            })}
                        </form>
                    </div>
                    <div className="mdl-dialog__actions">
                        <button onClick={() => { this.cancelDialog() }} className="mdl-button mdl-js-button mdl-button--raised mdl-button--accent addAccountBtn" >
                            Cancel</button>
                        <button onClick={() => { this.accountSelected() }} className="mdl-button mdl-js-button mdl-button--raised mdl-button--colored addAccountBtn" >
                            Select</button>
                        <button className="mdl-button mdl-js-button mdl-button--raised mdl-button--colored" >
                            <Link to="/wallet/addWallet">
                                New Account</Link></button>
                    </div>
                </Dialog>
            </div>
        )
    }
    private fetchNextTxs() {
        this.state.rest.getNextTxs(this.state.wallet.address, this.state.txs[this.state.txs.length - 1].hash).then((result: ITxProp[]) => {
            if (result.length === 0) { this.setState({ hasMore: false }) }
            this.setState({
                txs: update(this.state.txs, { $push: result }),
            })
        })
    }
}
