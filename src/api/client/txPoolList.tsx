import * as React from "react"
import update = require("react-addons-update")
import * as ReactPaginate from "react-paginate"
import { Link } from "react-router-dom"
import { IRest, ITxProp } from "./rest"
import { TxLine } from "./txLine"
interface ITxListView {
    rest: IRest
    txs: ITxProp[]
}
export class TxPoolList extends React.Component<any, any> {
    // public intervalId: any // NodeJS.Timer
    public mounted: boolean = false

    constructor(props: any) {
        super(props)
        this.state = { txs: [], rest: props.rest, length: 0, index: 0 }
    }

    public componentWillUnmount() {
        this.mounted = false
        // this.intervalId = null
    }

    public componentDidMount() {
        this.getPendingTxs()
        // this.getPendingTxs(this.state.index)
        // this.intervalId = setInterval(() => {
        //     this.getPendingTxs(this.state.index)
        // }, 10000)
    }

    public getPendingTxs() {
        this.state.rest.getPendingTxs()
            .then((result: { txs: ITxProp[], length: number }) => {
                this.setState({
                    txs: update(
                        this.state.txs, {
                            $splice: [[0, this.state.txs.length]],
                        },
                    ),
                })
                this.setState({
                    txs: update(
                        this.state.txs, {
                            $push: result.txs,
                        },
                    ),
                })
            })
    }

    public render() {
        let txIndex = 0
        if (this.state.txs.length === 0) {
            return <div className="contentTitle">Transactions</div>
        }
        return (
            <div>
                <div className="contentTitle">Transactions</div>
                {/* <div className="contentTitle"> Transactions
                    <span className="seeMoreLink">
                        <ReactPaginate previousLabel={"PREV"}
                            nextLabel={"NEXT"}
                            breakLabel={<a>...</a>}
                            breakClassName={"break-me"}
                            pageCount={this.state.length}
                            marginPagesDisplayed={1}
                            pageRangeDisplayed={9}
                            onPageChange={this.handlePageClick}
                            containerClassName={"pagination"}
                            activeClassName={"active"}
                            initialPage={this.state.index}
                            disableInitialCallback={true}
                        />
                    </span>
                </div> */}
                {this.state.txs.map((tx: ITxProp) => {
                    return (
                        <div key={txIndex++}>
                            <TxLine tx={tx} rest={this.state.rest} />
                            <button className="mdl-button mdl-js-button mdl-button--raised mdl-button--colored txAmtBtn green">
                                {tx.estimated + " HYCON"}
                            </button>
                            <button className="mdl-button mdl-js-button mdl-button--raised mdl-button--colored txAmtBtn red">
                                Not Confirmed
                            </button>
                        </div>
                    )
                })}
            </div>
        )
    }
}
