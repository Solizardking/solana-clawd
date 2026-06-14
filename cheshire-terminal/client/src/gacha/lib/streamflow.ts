// Streamflow JS SDK — CLAWD token vesting streams for jackpot/legendary prizes
import {
  getBN,
  SolanaStreamClient,
  StreamDirection,
  StreamType,
  type Contract,
} from '@streamflow/stream';
import { CLAWD_DECIMALS, CLAWD_MINT_STR, SOLANA_RPC } from './connection';

export const STREAMFLOW_PROGRAM_ID = 'strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUxfmKg5m';
const SECONDS_PER_DAY = 86400;

export interface VestingStreamParams {
  recipientAddress: string;
  clawdAmount: number;
  vestingDays: number;
  cliffDays: number;
  name: string;
}

export interface VestingStreamResult {
  txId: string | null;
  metadataId: string | null;
  error?: string;
}

export interface StreamflowStream {
  id: string;
  name: string;
  recipient: string;
  totalAmount: number;
  vestedAmount: number;
  startTs: number;
  endTs: number;
  tokenMint: string;
  cliffTs: number;
  withdrawn: number;
  isPaused: boolean;
  isCanceled: boolean;
}

function buildCreateParams(params: VestingStreamParams) {
  const { recipientAddress, clawdAmount, vestingDays, cliffDays, name } = params;
  const nowSec = Math.floor(Date.now() / 1000);
  const cliffSec = nowSec + cliffDays * SECONDS_PER_DAY;
  const totalBN = getBN(clawdAmount, CLAWD_DECIMALS);
  const releaseCount = Math.max(1, Math.ceil((vestingDays - cliffDays) / 30));
  const perPeriodBN = totalBN.divn(releaseCount);

  return {
    recipient: recipientAddress,
    tokenId: CLAWD_MINT_STR,
    start: nowSec,
    amount: totalBN,
    period: SECONDS_PER_DAY * 30,
    cliff: cliffSec,
    cliffAmount: getBN(0, CLAWD_DECIMALS),
    amountPerPeriod: perPeriodBN,
    name,
    canTopup: false,
    cancelableBySender: true,
    cancelableByRecipient: false,
    transferableBySender: true,
    transferableByRecipient: false,
    automaticWithdrawal: true,
    withdrawalFrequency: SECONDS_PER_DAY * 30,
    partner: undefined,
  };
}

export async function createVestingStream(
  walletAdapter: unknown,
  params: VestingStreamParams,
): Promise<VestingStreamResult> {
  try {
    const client = new SolanaStreamClient(SOLANA_RPC);
    const createParams = buildCreateParams(params);
    // Cross-version @solana/web3.js boundary — Streamflow bundles its own copy
    type AnyCreate = Parameters<typeof client.create>;
    const result = await client.create(
      createParams as AnyCreate[0],
      { sender: walletAdapter as AnyCreate[1]['sender'], isNative: false },
    );
    return { txId: result.txId ?? null, metadataId: result.metadataId ?? null };
  } catch (err) {
    return { txId: null, metadataId: null, error: err instanceof Error ? err.message : String(err) };
  }
}

const UNIT = 10 ** CLAWD_DECIMALS;

function contractToStream(id: string, s: Contract): StreamflowStream {
  return {
    id,
    name: s.name,
    recipient: s.recipient,
    totalAmount: Number(s.depositedAmount) / UNIT,
    vestedAmount: Number(s.amountPerPeriod) / UNIT,
    startTs: s.start,
    endTs: Number('end' in s ? (s as Contract & { end: number }).end : 0),
    tokenMint: s.mint,
    cliffTs: s.cliff,
    withdrawn: Number(s.withdrawnAmount) / UNIT,
    isPaused: Boolean((s as Contract & { paused?: boolean }).paused),
    isCanceled: (s.canceledAt ?? 0) > 0,
  };
}

export async function fetchUserStreams(walletAddress: string): Promise<StreamflowStream[]> {
  try {
    const client = new SolanaStreamClient(SOLANA_RPC);
    const streams = await client.get({
      address: walletAddress,
      type: StreamType.All,
      direction: StreamDirection.All,
    });
    return streams
      .filter(([, s]) => s.mint === CLAWD_MINT_STR)
      .map(([id, s]) => contractToStream(id, s));
  } catch {
    return [];
  }
}

export function formatVestingSchedule(params: VestingStreamParams): string {
  const months = Math.ceil((params.vestingDays - params.cliffDays) / 30);
  return `${params.clawdAmount.toLocaleString()} CLAWD · ${params.cliffDays}d cliff · ${months}mo release`;
}
