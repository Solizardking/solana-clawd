import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import WebSocket from 'ws';

interface BondingCurveState {
    virtualTokenReserves: BN;
    virtualSolReserves: BN;
    realTokenReserves: BN;
    realSolReserves: BN;
    tokenTotalSupply: BN;
    complete: boolean;
    migrationTimestamp?: BN;
    dexProgramId?: string;
}

export class BondingCurveTracker {
    private connection: Connection;
    private programId: PublicKey;
    private wsEndpoint: string;

    constructor(
        rpcEndpoint: string,
        wsEndpoint: string,
        programId: string
    ) {
        this.connection = new Connection(rpcEndpoint);
        this.programId = new PublicKey(programId);
        this.wsEndpoint = wsEndpoint;
    }

    private async getAssociatedBondingCurveAddress(mint: PublicKey): Promise<[PublicKey, number]> {
        return PublicKey.findProgramAddress(
            [Buffer.from("bonding-curve"), mint.toBuffer()],
            this.programId
        );
    }

    async getBondingCurveState(curveAddress: PublicKey): Promise<BondingCurveState | null> {
        try {
            const accountInfo = await this.connection.getAccountInfo(curveAddress);
            if (!accountInfo || !accountInfo.data) {
                return null;
            }

            // Parse account data according to our Anchor state structure
            const state = {
                virtualTokenReserves: new BN(accountInfo.data.slice(8, 16)),
                virtualSolReserves: new BN(accountInfo.data.slice(16, 24)),
                realTokenReserves: new BN(accountInfo.data.slice(24, 32)),
                realSolReserves: new BN(accountInfo.data.slice(32, 40)),
                tokenTotalSupply: new BN(accountInfo.data.slice(40, 48)),
                complete: accountInfo.data[48] === 1,
                migrationTimestamp: accountInfo.data[48] === 1 ? new BN(accountInfo.data.slice(49, 57)) : undefined,
                dexProgramId: accountInfo.data[48] === 1 ? new PublicKey(accountInfo.data.slice(57, 89)).toBase58() : undefined
            };

            return state;
        } catch (error) {
            console.error(`Error fetching curve state for ${curveAddress.toBase58()}:`, error);
            return null;
        }
    }

    async monitorBondingCurves(mintAddresses: string[], interval: number = 60000) {
        const mints = mintAddresses.map(addr => new PublicKey(addr));
        const curveAddresses = await Promise.all(
            mints.map(mint => this.getAssociatedBondingCurveAddress(mint))
        );

        const statuses = new Map<string, boolean>();

        while (true) {
            console.log("\nChecking bonding curve statuses...");
            console.log("-".repeat(50));

            for (let i = 0; i < mints.length; i++) {
                const mint = mints[i];
                const [curveAddress] = curveAddresses[i];
                const state = await this.getBondingCurveState(curveAddress);

                if (state) {
                    const isComplete = state.complete;
                    if (statuses.get(mint.toBase58()) !== isComplete) {
                        statuses.set(mint.toBase58(), isComplete);
                        console.log(`Token: ${mint.toBase58()}`);
                        console.log(`Bonding Curve: ${curveAddress.toBase58()}`);
                        console.log(`Status: ${isComplete ? 'Completed' : 'Not Completed'}`);

                        if (isComplete && state.dexProgramId) {
                            console.log(`Migration Details:`);
                            console.log(`- DEX Program: ${state.dexProgramId}`);
                            console.log(`- Migration Time: ${new Date(state.migrationTimestamp!.toNumber() * 1000).toISOString()}`);
                            console.log(`- Final SOL Reserves: ${state.realSolReserves.toNumber() / LAMPORTS_PER_SOL} SOL`);
                            console.log(`- Final Token Reserves: ${state.realTokenReserves.toNumber() / LAMPORTS_PER_SOL} tokens`);
                        }
                    }
                }
            }

            await new Promise(resolve => setTimeout(resolve, interval));
        }
    }

    async listenForPoolEvents() {
        const ws = new WebSocket(this.wsEndpoint);

        ws.on('open', () => {
            console.log('Connected to WebSocket');

            // Subscribe to both program logs and transaction events
            const subscribeMsg = {
                jsonrpc: '2.0',
                id: 1,
                method: 'programSubscribe',
                params: [
                    this.programId.toBase58(),
                    {
                        encoding: 'jsonParsed',
                        commitment: 'confirmed',
                        filters: [
                            { dataSize: 89 }, // Size of our bonding curve account
                            { memcmp: { offset: 48, bytes: "1" } } // Filter for completed curves
                        ]
                    }
                ]
            };

            ws.send(JSON.stringify(subscribeMsg));
        });

        ws.on('message', (data: Buffer) => {
            try {
                const response = JSON.parse(data.toString());
                if (response.method === 'programNotification') {
                    this.handleProgramNotification(response.params.result);
                }
            } catch (error) {
                console.error('Error processing WebSocket message:', error);
            }
        });

        ws.on('error', console.error);
        ws.on('close', () => {
            console.log('WebSocket connection closed, reconnecting...');
            setTimeout(() => this.listenForPoolEvents(), 5000);
        });
    }

    private handleProgramNotification(notification: any) {
        if (notification.logs) {
            const logs = notification.logs;
            // Check for both migration and pool initialization events
            if (logs.some((log: string) => log.includes('MigrationEvent'))) {
                console.log('Token Migration Detected!');
                console.log('Transaction signature:', notification.signature);
                // Extract and log migration details
                const migrationLog = logs.find((log: string) => log.includes('MigrationEvent'));
                if (migrationLog) {
                    console.log('Migration Log:', migrationLog);
                }
            }
            if (logs.some((log: string) => log.includes('initialize2: InitializeInstruction2'))) {
                console.log('New DEX Pool Initialized!');
                console.log('Transaction signature:', notification.signature);
            }
        }
    }
}

if (require.main === module) {
    const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL;
    const WSS_ENDPOINT = process.env.WSS_ENDPOINT;
    const PROGRAM_ID = process.env.PROGRAM_ID;

    if (!HELIUS_RPC_URL || !WSS_ENDPOINT || !PROGRAM_ID) {
        console.error('Missing required environment variables');
        process.exit(1);
    }

    const tracker = new BondingCurveTracker(
        HELIUS_RPC_URL,
        WSS_ENDPOINT,
        PROGRAM_ID
    );

    // Start monitoring specific token mint addresses
    const mintAddresses = process.argv.slice(2);
    if (mintAddresses.length === 0) {
        console.error('Please provide at least one token mint address to monitor');
        process.exit(1);
    }

    Promise.all([
        tracker.monitorBondingCurves(mintAddresses),
        tracker.listenForPoolEvents()
    ]).catch(console.error);
}
