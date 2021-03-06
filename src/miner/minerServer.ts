import { wordlists } from "bip39"
import { getLogger } from "log4js"
import Long = require("long")
import { Address } from "../common/address"
import { Block } from "../common/block"
import { BlockHeader } from "../common/blockHeader"
import { DBBlock } from "../consensus/database/dbblock"
import { WorldState } from "../consensus/database/worldState"
import { DifficultyAdjuster } from "../consensus/difficultyAdjuster"
import { IConsensus } from "../consensus/iconsensus"
import { globalOptions } from "../main"
import { INetwork } from "../network/inetwork"
import { Hash } from "../util/hash"
import { CpuMiner } from "./cpuMiner"
import { StratumServer } from "./stratumServer"

const logger = getLogger("Miner")

export class MinerServer {
    public static async checkNonce(preHash: Uint8Array, nonce: Long, difficulty: number): Promise<boolean> {
        // Consensus Critical
        const buffer = Buffer.allocUnsafe(72)
        buffer.fill(preHash, 0, 64)
        buffer.writeUInt32LE(nonce.getLowBitsUnsigned(), 64)
        buffer.writeUInt32LE(nonce.getHighBitsUnsigned(), 68)
        const target = DifficultyAdjuster.getTarget(difficulty)
        return DifficultyAdjuster.acceptable(await Hash.hashCryptonight(buffer), target)
    }

    private consensus: IConsensus
    private network: INetwork
    private stratumServer: StratumServer
    private cpuMiner: CpuMiner
    private intervalId: NodeJS.Timer
    private worldState: WorldState

    public constructor(worldState: WorldState, consensus: IConsensus, network: INetwork, cpuMiners: number, stratumPort: number) {
        this.worldState = worldState
        this.consensus = consensus
        this.network = network
        this.stratumServer = new StratumServer(this, stratumPort)
        this.cpuMiner = new CpuMiner(this, cpuMiners)
        this.consensus.on("candidate", (previousDBBlock: DBBlock, previousHash: Hash) => this.candidate(previousDBBlock, previousHash))
    }

    public async submitBlock(block: Block) {
        this.stop()
        if (await this.consensus.putBlock(block)) {
            this.network.broadcastBlocks([block])
        }
    }
    public stop(): void {
        this.cpuMiner.stop()
        this.stratumServer.stop()
    }
    private candidate(previousDBBlock: DBBlock, previousHash: Hash): void {
        if (globalOptions.minerAddress === undefined || globalOptions.minerAddress === "") {
            logger.info("Can't mine without miner address")
            return
        }
        const miner: Address = new Address(globalOptions.minerAddress)
        logger.info(`New Candidate Block Difficulty: 0x${previousDBBlock.nextDifficulty.toExponential()} Target: ${DifficultyAdjuster.getTarget(previousDBBlock.nextDifficulty, 32).toString("hex")}`)
        clearInterval(this.intervalId)
        this._(previousDBBlock, previousHash, miner)
        this.intervalId = setInterval(() => this._(previousDBBlock, previousHash, miner), 2000)

    }

    private async _(previousDBBlock: DBBlock, previousHash: Hash, miner: Address) {
        const timeStamp = Math.max(Date.now(), previousDBBlock.header.timeStamp + 50)

        const { stateTransition: { currentStateRoot }, validTxs, invalidTxs } = await this.worldState.next(previousDBBlock.header.stateRoot, miner)
        const block = new Block({
            header: new BlockHeader({
                difficulty: previousDBBlock.nextDifficulty,
                merkleRoot: Block.calculateMerkleRoot(validTxs),
                miner,
                nonce: -1,
                previousHash: [previousHash],
                stateRoot: currentStateRoot,
                timeStamp,
            }),
            txs: validTxs,
        })

        const prehash = block.header.preHash()
        this.cpuMiner.putWork(block, prehash, block.header.difficulty)
        this.stratumServer.putWork(block, prehash, this.cpuMiner.minerCount)
    }
}
