import * as bodyParser from "body-parser"
import * as express from "express"
import * as jwt from "jsonwebtoken"
import { getLogger } from "log4js"
import opn = require("opn")
import * as React from "react"
import { matchPath } from "react-router"
import { matchRoutes, renderRoutes } from "react-router-config"
import { SignedTx } from "../../common/txSigned"
import { IConsensus } from "../../consensus/iconsensus"
import { IPeer } from "../../network/ipeer"
import { RestManager } from "../../rest/restManager"
import * as proto from "../../serialization/proto"
import * as Hycon from "../../server"
import { App, routes } from "../client/app"
import { indexRender } from "./index"
import { RestServer } from "./restServer"
const logger = getLogger("RestClient")
const apiVersion = "v1"

// tslint:disable:object-literal-sort-keys
export class HttpServer {
    public app: express.Application
    public rest: RestServer
    public hyconServer: RestManager

    constructor(hyconServer: RestManager, port: number = 8080, options: any) {
        this.app = express()
        this.config()
        this.app.all("/*", (req: express.Request, res: express.Response, next: express.NextFunction) => {
            if (options.nonLocal) {
                res.header("Access-Control-Allow-Origin", "*")

            } else {
                res.header("Access-Control-Allow-Origin", "localhost")
            }
            res.header("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE")
            res.header("Access-Control-Allow-Headers", "Content-type, Accept, X-Access-Token, X-Key")
            res.header("X-FRAME-OPTIONS", "DENY")
            if (req.method === "OPTIONS") {
                res.status(200).end()
            } else {
                next()
            }
        })
        this.app.use((req: express.Request, res: express.Response, next: express.NextFunction) => this.reactRoute(req, res, next))
        // this.app.use(express.static("src/api/clientDist"))
        this.app.use(express.static("data/clientDist"))
        this.app.use(express.static("node_modules"))
        this.routeRest()
        this.rest = new RestServer(hyconServer.consensus, hyconServer.network, hyconServer.txQueue)
        this.app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
            res.status(404)
            res.json({
                status: 404,
                timestamp: Date.now(),
                error: "INVALID_ROUTE",
                message: "resource not found",
            })
        })
        this.app.listen(port, "localhost", () => { opn(`http://localhost:${port}`) })
        this.hyconServer = hyconServer
        logger.info(">>>>>>> Started RESTful API")
    }

    public reactRoute(
        req: express.Request,
        res: express.Response,
        next: express.NextFunction,
    ) {
        const branches = matchRoutes(routes, req.url)
        if (branches.length > 0) {
            logger.info("react: " + req.url)
            const context: { url?: string } = {}
            const page = indexRender(this.rest, req.url, context)
            if (context.url) {
                res.redirect(context.url, 301)
            } else {
                res.send(page)
            }
        } else {
            logger.info("other: " + req.url)
            next()
        }
    }

    public routeRest() {
        let router: express.Router
        router = express.Router()

        router.post("/wallet", async (req: express.Request, res: express.Response) => {
            res.json(await this.rest.createNewWallet({
                mnemonic: req.body.mnemonic,
                language: req.body.language,
            }))
        })
        router.get("/wallet/:address/balance", async (req: express.Request, res: express.Response) => {
            res.json(await this.rest.getWalletBalance(req.params.address))
        })
        router.get("/wallet/:address/txs/:nonce?", async (req: express.Request, res: express.Response) => {
            res.json(await this.rest.getWalletTransactions(req.params.address, req.params.nonce))
        })
        router.put("/wallet/:address/callback", async (req: express.Request, res: express.Response) => {
            res.json(await this.hyconServer.createSubscription({
                address: req.params.address,
                url: req.body.url,
                from: req.body.from,
                to: req.body.to,
            }))
        })
        router.delete("/wallet/:address/callback/:id", async (req: express.Request, res: express.Response) => {
            res.json(await this.hyconServer.deleteSubscription(req.params.address, req.params.id))
        })
        router.post("/signedtx", async (req: express.Request, res: express.Response) => {
            logger.debug("Route triggered")
            res.json(
                await this.rest.outgoingSignedTx({
                    privateKey: req.body.privateKey,
                    from: req.body.from,
                    to: req.body.to,
                    amount: req.body.amount,
                    fee: req.body.fee,
                }, (tx: SignedTx) => {
                    this.hyconServer.txQueue.putTxs([tx])
                    this.hyconServer.broadcastTxs([tx])
                }),
            )
        })
        router.post("/tx", async (req: express.Request, res: express.Response) => {
            res.json(
                await this.rest.outgoingTx({
                    signature: req.body.signature,
                    from: req.body.from,
                    to: req.body.to,
                    amount: req.body.amount,
                    fee: req.body.fee,
                    nonce: req.body.nonce,
                    recovery: req.body.recovery,
                }, (tx: SignedTx) => {
                    this.hyconServer.txQueue.putTxs([tx])
                    this.hyconServer.broadcastTxs([tx])
                }),
            )
        })
        router.get("/deleteWallet/:name", async (req: express.Request, res: express.Response) => {
            res.json(await this.rest.deleteWallet(req.params.name))
        })
        router.post("/generateWallet", async (req: express.Request, res: express.Response) => {
            res.json(
                await this.rest.generateWallet({
                    name: req.body.name,
                    password: req.body.password,
                    hint: req.body.hint,
                    mnemonic: req.body.mnemonic,
                    language: req.body.language,
                }),
            )
        })
        router.get("/address/:address", async (req: express.Request, res: express.Response) => {
            res.json(await this.rest.getAddressInfo(req.params.address))
        })
        router.get("/getAllAccounts/:name", async (req: express.Request, res: express.Response) => {
            res.json(await this.rest.getAllAccounts(req.params.name))
        })
        router.get("/block/:hash", async (req: express.Request, res: express.Response) => {
            res.json(await this.rest.getBlock(req.params.hash))
        })
        router.get("/blockList/:index", async (req: express.Request, res: express.Response) => {
            res.json(await this.rest.getBlockList(req.params.index))
        })
        router.get("/language", async (req: express.Request, res: express.Response) => {
            res.json("error TS2339: Property 'getLanguage' does not exist on type 'RestServer'.")
            // res.json(await this.rest.getLanguage())
        })
        router.get("/getMnemonic/:lang", async (req: express.Request, res: express.Response) => {
            res.json(await this.rest.getMnemonic(req.params.lang))
        })
        router.get("/tx/:hash", async (req: express.Request, res: express.Response) => {
            res.json(await this.rest.getTx(req.params.hash))
        })
        router.get("/wallet/detail/:name", async (req: express.Request, res: express.Response) => {
            res.json(await this.rest.getWalletDetail(req.params.name))
        })
        router.get("/wallet", async (req: express.Request, res: express.Response) => {
            res.json(await this.rest.getWalletList())
        })
        router.post("/recoverWallet", async (req: express.Request, res: express.Response) => {
            res.json(
                await this.rest.recoverWallet({
                    name: req.body.name,
                    password: req.body.password,
                    hint: req.body.hint,
                    mnemonic: req.body.mnemonic,
                    language: req.body.language,
                }),
            )
        })
        router.post("/transaction", async (req: express.Request, res: express.Response) => {
            res.json(
                await this.rest.sendTx({
                    name: req.body.name,
                    password: req.body.password,
                    address: req.body.address,
                    amount: req.body.amount,
                    minerFee: req.body.minerFee,
                }, (tx: SignedTx) => {
                    this.hyconServer.txQueue.putTxs([tx])
                    this.hyconServer.broadcastTxs([tx])
                }),
            )
        })

        router.get("/txList/:index", async (req: express.Request, res: express.Response) => {
            res.json(await this.rest.getPendingTxs(req.params.index))
        })

        router.get("/peerList", async (req: express.Request, res: express.Response) => {
            res.json(await this.rest.getPeerList())
        })

        router.get("/peerConnected", async (req: express.Request, res: express.Response) => {
            res.json(await this.rest.getPeerConnected())
        })

        router.get("/hint/:name", async (req: express.Request, res: express.Response) => {
            res.json(await this.rest.getHint(req.params.name))
        })
        router.get("/nextTxs/:address/:txHash/:index", async (req: express.Request, res: express.Response) => {
            res.json(await this.rest.getNextTxs(req.params.address, req.params.txHash, req.params.index))
        })

        router.get("/dupleName/:name", async (req: express.Request, res: express.Response) => {
            res.json(await this.rest.checkDupleName(req.params.name))
        })

        router.get("/getMinedInfo/:address/:blockHash/:index", async (req: express.Request, res: express.Response) => {
            res.json(await this.rest.getMinedBlocks(req.params.address, req.params.blockHash, req.params.index))
        })

        this.app.use(`/api/${apiVersion}`, router)
    }

    public config() {
        this.app.use(bodyParser.json())
    }
}
