/**
 * StreamFlow Service
 * 
 * Real-time integration with the StreamFlow protocol on Solana for:
 * - Querying locked/vested token balances
 * - Token streaming payments
 * - Vesting schedules with time-locked releases
 * 
 * StreamFlow Protocol: https://streamflow.finance/
 * SDK: @streamflow/stream
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { 
  SolanaStreamClient, 
  StreamDirection, 
  StreamType,
  type Stream,
  type TabulariumContract,
  decodeStream,
  createClient,
} from '@streamflow/stream';
import { getLogger } from './util';

const logger = getLogger('StreamFlow');

export const CLAWD_MINT = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";

// StreamFlow program ID on Solana mainnet
const STREAMFLOW_PROGRAM_ID = new PublicKey('streAmFinxBE76rG5VvuuGs9jCT7A7KpANKXMfJqZRy');

// Account struct offset for the mint field in StreamFlow contract accounts
// This lets us use memcmp filters with getProgramAccounts
const MINT_OFFSET = 177;

export interface LockedBalanceInfo {
  /** Total raw amount locked (before decimals) */
  totalLockedRaw: string;
  /** Total amount locked in human-readable form (accounting for decimals) */
  totalLocked: number;
  /** Total amount already withdrawn */
  totalWithdrawn: number;
  /** Number of active (non-closed) streams */
  activeStreamCount: number;
  /** Number of closed streams */
  closedStreamCount: number;
  /** Number of vesting streams */
  vestingCount: number;
  /** Number of lock streams */
  lockCount: number;
  /** Individual stream details */
  streams: StreamSummary[];
  /** Token mint address */
  tokenMint: string;
  /** Token decimals (default 6) */
  decimals: number;
  /** Timestamp of the query */
  queriedAt: string;
}

export interface StreamSummary {
  address: string;
  sender: string;
  recipient: string;
  depositedAmount: number;
  withdrawnAmount: number;
  remainingAmount: number;
  unlockedAmount: number;
  startTime: number;
  endTime: number;
  cliffTime: number;
  cliffAmount: number;
  amountPerPeriod: number;
  period: number;
  type: 'vesting' | 'lock' | 'stream';
  isClosed: boolean;
  isCancelled: boolean;
  name: string;
}

/**
 * Service for querying StreamFlow protocol data in real-time.
 * Uses the StreamFlow SDK to interact with on-chain contract accounts.
 */
export class StreamFlowService {
  private connection: Connection;
  private client: SolanaStreamClient;
  private decimals: number;

  constructor(connection: Connection, decimals: number = 6) {
    this.connection = connection;
    this.decimals = decimals;
    // Initialize the SDK client - queries chain via RPC and REST API
    this.client = new SolanaStreamClient(
      connection.rpcEndpoint,
      undefined,
      'confirmed',
    );
    logger.info('StreamFlow service initialized');
  }

  /**
   * Fetch all StreamFlow contracts for a specific token mint.
   * Uses getProgramAccounts with memcmp filter on the mint offset.
   */
  async getLockedBalance(tokenMint: string = CLAWD_MINT): Promise<LockedBalanceInfo> {
    const mintPubkey = new PublicKey(tokenMint);
    const mintBytes = mintPubkey.toBytes();

    logger.info(`Fetching StreamFlow contracts for token ${tokenMint}`);

    try {
      // Use getProgramAccounts to find all stream accounts for this mint
      const accounts = await this.connection.getProgramAccounts(
        STREAMFLOW_PROGRAM_ID,
        {
          filters: [
            { memcmp: { offset: MINT_OFFSET, bytes: mintPubkey.toBase58() } },
            { dataSize: 750 }, // Stream account data size
          ],
        }
      );

      logger.info(`Found ${accounts.length} total stream accounts for ${tokenMint}`);

      const streams: StreamSummary[] = [];
      let totalLockedRaw = BigInt(0);
      let totalWithdrawn = 0;
      let activeCount = 0;
      let closedCount = 0;
      let vestingCount = 0;
      let lockCount = 0;

      for (const { pubkey, account } of accounts) {
        try {
          const decoded = decodeStream(Buffer.from(account.data));
          
          // Convert BN fields to numbers for easier comparison/arithmetic
          const cliffAmount = Number(decoded.cliffAmount);
          const amountPerPeriod = Number(decoded.amountPerPeriod);
          const depositedAmount = Number(decoded.depositedAmount);
          const withdrawnAmount = Number(decoded.withdrawnAmount);
          const endTime = Number(decoded.end);
          const startTime = Number(decoded.start);
          const cliffTime = Number(decoded.cliff);
          const period = Number(decoded.period);
          const canceledAt = Number(decoded.canceledAt);
          
          // Determine stream type
          const isVestingType = cliffAmount > 0 || amountPerPeriod > 0;
          const tokensPerPeriod = amountPerPeriod / 10 ** this.decimals;
          const deposited = depositedAmount / 10 ** this.decimals;
          const withdrawn = withdrawnAmount / 10 ** this.decimals;
          const cliffAmt = cliffAmount / 10 ** this.decimals;
          
          // Calculate unlocked amount using SDK helper
          const now = Math.floor(Date.now() / 1000);
          const isStreamClosed = decoded.closed;
          const isStreamCancelled = canceledAt > 0;
          
          let unlockedRaw: number;
          if (isStreamClosed || isStreamCancelled) {
            unlockedRaw = depositedAmount; // all is unlocked if closed/cancelled
          } else {
            unlockedRaw = this.calculateUnlocked(
              depositedAmount,
              cliffAmount,
              endTime,
              now,
              amountPerPeriod,
              period,
              cliffTime,
            );
          }
          const unlockedNum = unlockedRaw / 10 ** this.decimals;
          const remaining = deposited - withdrawn;

          let streamType: 'vesting' | 'lock' | 'stream' = 'stream';
          if (isVestingType && endTime > startTime + 86400) {
            streamType = 'vesting';
            vestingCount++;
          } else if (isVestingType) {
            streamType = 'lock';
            lockCount++;
          }

          if (isStreamClosed) closedCount++;
          else activeCount++;

          totalLockedRaw += BigInt(depositedAmount);
          totalWithdrawn += withdrawn;

          streams.push({
            address: pubkey.toBase58(),
            sender: decoded.sender.toBase58(),
            recipient: decoded.recipient.toBase58(),
            depositedAmount: deposited,
            withdrawnAmount: withdrawn,
            remainingAmount: remaining,
            unlockedAmount: unlockedNum,
            startTime,
            endTime,
            cliffTime,
            cliffAmount: cliffAmt,
            amountPerPeriod: tokensPerPeriod,
            period,
            type: streamType,
            isClosed: isStreamClosed,
            isCancelled: isStreamCancelled,
            name: decoded.name || '',
          });
        } catch (parseErr) {
          logger.warn(`Failed to parse stream account ${pubkey.toBase58()}: ${parseErr}`);
        }
      }

      const totalLocked = Number(totalLockedRaw) / 10 ** this.decimals;

      return {
        totalLockedRaw: totalLockedRaw.toString(),
        totalLocked,
        totalWithdrawn,
        activeStreamCount: activeCount,
        closedStreamCount: closedCount,
        vestingCount,
        lockCount,
        streams,
        tokenMint,
        decimals: this.decimals,
        queriedAt: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error('Error fetching StreamFlow contracts:', error);
      throw new Error(`Failed to fetch locked balances: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Calculate unlocked amount for a linear stream.
   */
  private calculateUnlocked(
    depositedAmount: number,
    cliffAmount: number,
    end: number,
    currentTimestamp: number,
    amountPerPeriod: number,
    period: number,
    cliff: number,
  ): number {
    // If cliff hasn't passed yet
    if (currentTimestamp < cliff) {
      return 0;
    }

    // If all time has elapsed, everything is unlocked
    if (currentTimestamp >= end) {
      return depositedAmount;
    }

    // If no cliff amount, use per-period linear unlock
    if (cliffAmount === 0 && amountPerPeriod === 0) {
      // No unlock schedule means everything is locked until end
      return 0;
    }

    // Calculate periods elapsed since cliff
    if (amountPerPeriod > 0 && period > 0) {
      const elapsed = currentTimestamp - Math.max(cliff, 0);
      const periodsElapsed = Math.floor(elapsed / Math.max(period, 1));
      const unlocked = cliffAmount + periodsElapsed * amountPerPeriod;
      return unlocked > depositedAmount ? depositedAmount : unlocked;
    }

    return cliffAmount > depositedAmount ? depositedAmount : cliffAmount;
  }

  /**
   * Fetch all contracts via StreamFlow REST API (alternative method).
   * Useful for cross-referencing on-chain data with the API.
   */
  async getContractsFromApi(tokenMint: string = CLAWD_MINT): Promise<TabulariumContract[]> {
    try {
      const apiClient = createClient({ cluster: 'mainnet' });
      const contracts = await apiClient.getContracts();
      
      // Filter by mint
      const mintContracts = contracts.filter(c => c.mint === tokenMint && !c.isClosed);

      
      return mintContracts as unknown as TabulariumContract[];
    } catch (error: any) {
      logger.error('Error fetching contracts from API:', error);
      return [];
    }
  }
}

export default StreamFlowService;
