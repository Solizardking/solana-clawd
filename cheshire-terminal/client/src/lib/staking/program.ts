/**
 * Browser-side helpers for the OpenClawd Anchor staking program.
 *
 * The program stakes Metaplex Core agent assets by adding a frozen
 * FreezeDelegate plugin. Writes are signed by the connected wallet.
 */
import { AnchorProvider, BN, Program, web3 } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import {
  CLAWD_DECIMALS,
  GLOBAL_AUTHORITY_SEED,
  MPL_CORE_PROGRAM_ID,
  REWARD_RATE_BASE_UNITS_PER_SECOND,
  STAKING_IDL,
  STAKING_PROGRAM_ID,
  USER_POOL_SEED,
} from "./idl";

export const PROGRAM_ID = new PublicKey(STAKING_PROGRAM_ID);
export const MPL_CORE_PROGRAM = new PublicKey(MPL_CORE_PROGRAM_ID);

type StakingProgramRuntime = {
  connection?: Connection;
  programId?: PublicKey | string;
  rpcUrl?: string;
};

function resolveProgramId(programId?: PublicKey | string) {
  if (programId instanceof PublicKey) return programId;
  if (programId) return new PublicKey(programId);
  return PROGRAM_ID;
}

export function getStakingConnection(rpcUrl?: string): Connection {
  const rpc =
    rpcUrl ||
    (import.meta.env.VITE_OPENCLAWD_STAKING_RPC_URL as string | undefined) ||
    "https://api.devnet.solana.com";
  return new Connection(rpc, "confirmed");
}

export function findGlobalPoolPda(programId?: PublicKey | string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(GLOBAL_AUTHORITY_SEED)],
    resolveProgramId(programId)
  );
}

export function findUserPoolPda(
  asset: PublicKey,
  programId?: PublicKey | string
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(USER_POOL_SEED), asset.toBuffer()],
    resolveProgramId(programId)
  );
}

export function buildStakingProgram(
  wallet: WalletContextState,
  runtime: StakingProgramRuntime = {}
) {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error("Wallet not connected");
  }

  const programId = resolveProgramId(runtime.programId);
  const provider = new AnchorProvider(
    runtime.connection ?? getStakingConnection(runtime.rpcUrl),
    {
      publicKey: wallet.publicKey,
      signTransaction: wallet.signTransaction,
      signAllTransactions:
        wallet.signAllTransactions ??
        (async (txs) => Promise.all(txs.map((tx) => wallet.signTransaction!(tx)))),
    } as any,
    { commitment: "confirmed", preflightCommitment: "confirmed" }
  );

  const idl =
    STAKING_IDL.address === programId.toBase58()
      ? STAKING_IDL
      : { ...STAKING_IDL, address: programId.toBase58() };

  return new Program(idl as any, provider);
}

export async function fetchGlobalPool(
  connection: Connection,
  programId?: PublicKey | string
) {
  const [pda] = findGlobalPoolPda(programId);
  const acc = await connection.getAccountInfo(pda);
  if (!acc) return { initialized: false, pda: pda.toBase58() } as const;

  const data = acc.data.subarray(8);
  return {
    initialized: true,
    pda: pda.toBase58(),
    admin: new PublicKey(data.subarray(0, 32)).toBase58(),
    totalAgentsStaked: new BN(data.subarray(32, 40), "le").toString(),
    totalRewardsDistributed: new BN(data.subarray(40, 48), "le").toString(),
    reserved: [
      new BN(data.subarray(48, 56), "le").toString(),
      new BN(data.subarray(56, 64), "le").toString(),
      new BN(data.subarray(64, 72), "le").toString(),
      new BN(data.subarray(72, 80), "le").toString(),
    ],
  } as const;
}

export async function fetchUserPool(
  connection: Connection,
  asset: PublicKey,
  programId?: PublicKey | string
) {
  const [pda] = findUserPoolPda(asset, programId);
  const acc = await connection.getAccountInfo(pda);
  if (!acc) return null;

  const data = acc.data.subarray(8);
  const stakeTime = new BN(data.subarray(64, 72), "le").toNumber();
  const lastClaimTime = new BN(data.subarray(72, 80), "le").toNumber();
  const totalClaimedBaseUnits = new BN(data.subarray(80, 88), "le").toNumber();

  return {
    pda: pda.toBase58(),
    owner: new PublicKey(data.subarray(0, 32)).toBase58(),
    asset: new PublicKey(data.subarray(32, 64)).toBase58(),
    stakeTime,
    lastClaimTime,
    totalClaimedBaseUnits,
    totalClaimedClawd: totalClaimedBaseUnits / 10 ** CLAWD_DECIMALS,
  };
}

export async function initializePool(
  wallet: WalletContextState,
  runtime: StakingProgramRuntime = {}
) {
  const programId = resolveProgramId(runtime.programId);
  const program = buildStakingProgram(wallet, runtime);
  const sig = await (program.methods as any)
    .initialize()
    .accounts({
      admin: wallet.publicKey!,
      globalPool: findGlobalPoolPda(programId)[0],
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return {
    signature: sig,
    pool: findGlobalPoolPda(programId)[0].toBase58(),
  };
}

export async function stakeAgent(
  wallet: WalletContextState,
  asset: PublicKey,
  collection?: PublicKey | null,
  runtime: StakingProgramRuntime = {}
) {
  const programId = resolveProgramId(runtime.programId);
  const program = buildStakingProgram(wallet, runtime);
  const sig = await (program.methods as any)
    .stakeAgent()
    .accounts({
      owner: wallet.publicKey!,
      user: wallet.publicKey!,
      globalPool: findGlobalPoolPda(programId)[0],
      userPool: findUserPoolPda(asset, programId)[0],
      asset,
      collection: collection ?? null,
      coreProgram: MPL_CORE_PROGRAM,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return { signature: sig, userPool: findUserPoolPda(asset, programId)[0].toBase58() };
}

export async function unstakeAgent(
  wallet: WalletContextState,
  asset: PublicKey,
  collection?: PublicKey | null,
  runtime: StakingProgramRuntime = {}
) {
  const programId = resolveProgramId(runtime.programId);
  const program = buildStakingProgram(wallet, runtime);
  const sig = await (program.methods as any)
    .unstakeAgent()
    .accounts({
      owner: wallet.publicKey!,
      user: wallet.publicKey!,
      globalPool: findGlobalPoolPda(programId)[0],
      userPool: findUserPoolPda(asset, programId)[0],
      asset,
      collection: collection ?? null,
      coreProgram: MPL_CORE_PROGRAM,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return { signature: sig };
}

export async function claimRewards(
  wallet: WalletContextState,
  asset: PublicKey,
  runtime: StakingProgramRuntime = {}
) {
  const programId = resolveProgramId(runtime.programId);
  const program = buildStakingProgram(wallet, runtime);
  const sig = await (program.methods as any)
    .claimRewards()
    .accounts({
      owner: wallet.publicKey!,
      globalPool: findGlobalPoolPda(programId)[0],
      userPool: findUserPoolPda(asset, programId)[0],
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return { signature: sig };
}

export function estimatePendingClawd(lastClaimTimeSeconds: number) {
  const now = Math.floor(Date.now() / 1000);
  const elapsed = Math.max(0, now - lastClaimTimeSeconds);
  return (
    (elapsed * REWARD_RATE_BASE_UNITS_PER_SECOND) /
    10 ** CLAWD_DECIMALS
  );
}

export async function estimateStakeCost(connection: Connection) {
  const userPoolRent = await connection.getMinimumBalanceForRentExemption(96);
  const globalPoolRent = await connection.getMinimumBalanceForRentExemption(88);

  return {
    userPoolRentLamports: userPoolRent,
    userPoolRentSol: userPoolRent / web3.LAMPORTS_PER_SOL,
    globalPoolRentLamports: globalPoolRent,
    globalPoolRentSol: globalPoolRent / web3.LAMPORTS_PER_SOL,
    txFeeSol: 0.000005,
  };
}
