import * as ip from "ip"
import { getLogger } from "log4js"
import { INetwork } from "./inetwork"
//import { TurtleNetwork } from "./turtle/turtleNetwork"

const logger = getLogger("Upnp")
logger.level = "debug"
type TurtleNetwork = any;

export class UpnpServer {

    public static port: number
    public static product: string = "hycon"
    public static networkid: string = "1"
    public static version: string = "1.0.0"

    public info: any = {}

    constructor(port: number) {
        UpnpServer.port = port
        setTimeout(() => {
            this.run()
        }, 100)
    }

    public run() {
        const myLocation = UpnpServer.product + UpnpServer.networkid + "://" + ip.address() + ":" + UpnpServer.port
        logger.debug(`Upnp Server`)
        const Server = require("node-ssdp").Server
        const server = new Server({
            location: myLocation,
            sourcePort: 1900,
            udn: `${UpnpServer.product}:${UpnpServer.version}`,
        })

        server.start()
        logger.debug(`Upnp Server Started`)
    }
}

// tslint:disable-next-line:max-classes-per-file
export class UpnpClient {

    public localPeer: Map<string, string>
    public static threshold: number = 30 * 1000
    public appNetwork: TurtleNetwork
    public count: number = 0

    constructor(appNetwork: TurtleNetwork) {
        this.appNetwork = appNetwork
        this.localPeer = new Map()
        setTimeout(() => {
            this.run()
        }, 100)
        setInterval(() => {
            this.updateLocalPeer()
        }, 30 * 1000)
    }

    public updateLocalPeer() {
        const date = Date.now()
        this.localPeer.forEach((value, key) => {
            if (date - Date.parse(value) > UpnpClient.threshold) {
                this.localPeer.delete(key)
            }
        })
        logger.debug("localPeer: ", this.localPeer)
    }

    public run() {
        logger.debug(`Upnp Client`)
        const Client = require("node-ssdp").Client
        const client = new Client()

        client.search("urn:schemas-upnp-org:service:ContentDirectory:1")

        setInterval(() => {
            client.search("ssdp:all")
        }, 5 * 1000)

        client.on("response", (headers: any, code: any, rdebug: any) => {
            const ipaddress = rdebug.address
            const regex = /(\S+):\/\/([\.\d]+):(\d+)/g
            const match = regex.exec(headers.LOCATION)
            if (match) {
                const [product, localIP, localPort] = match.slice(1, 4)
                const isLocal = ipaddress === localIP && Number(localPort) === UpnpServer.port
                const fullProduct = UpnpServer.product + UpnpServer.networkid
                const isSameProduct = product === fullProduct
                const date = headers.DATE

                if (!isLocal && isSameProduct) {
                    // logger.debug(`debug = ${JSON.stringify(headers)}`)
                    // logger.debug("IP ADDRESS:", ipaddress)
                    // logger.debug("LOCAL ADDRESS:", localIP)
                    // logger.debug("IS LOCAL:", isLocal)
                    // logger.debug("DATE:", date)
                    // logger.debug(`DETECT IP Local=${isLocal} Product=${product} IP=${localIP} Port=${localPort}`)
                    if (!this.localPeer.has(`${localIP}:${localPort}`)) {
                        this.appNetwork.addClient(localIP, parseInt(localPort, 10))
                        this.count++
                    }
                    logger.debug(`addClient() been called: ${this.count.toString()} times`)
                    this.localPeer.set(`${localIP}:${localPort}`, date)

                }
            } else {
                logger.error("Invalid format: headers.LOCATION")
                throw Error("Invalid format: headers.LOCATION")
            }

        })

    }
}
