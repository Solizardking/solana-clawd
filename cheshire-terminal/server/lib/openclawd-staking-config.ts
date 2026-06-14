import { Connection, PublicKey } from "@solana/web3.js";

export const DEFAULT_OPENCLAWD_STAKING_PROGRAM_ID =
  "9f84tiYsb7RoXwzpGwo2YzhaTDgM2HhKSF9rFncG9TTP";
export const DEFAULT_OPENCLAWD_STAKING_RPC_URL =
  "https://api.devnet.solana.com";
export const DEFAULT_OPENCLAWD_STAKING_PUBLIC_RPC_URL =
  "https://api.devnet.solana.com";
const GLOBAL_AUTHORITY_SEED = Buffer.from("global-authority");

function pickFirst(...values: Array<string | undefined | null>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

export function getOpenClawdStakingProgramIdString() {
  return (
    pickFirst(
      process.env.OPENCLAWD_AGENT_STAKING_PROGRAM_ID,
      process.env.VITE_OPENCLAWD_AGENT_STAKING_PROGRAM_ID,
      process.env.VITE_OPENCLAWD_STAKING_PROGRAM_ID,
    ) ?? DEFAULT_OPENCLAWD_STAKING_PROGRAM_ID
  );
}

export function getOpenClawdStakingProgramId() {
  return new PublicKey(getOpenClawdStakingProgramIdString());
}

export function getOpenClawdStakingRpcUrl() {
  return (
    pickFirst(
      process.env.OPENCLAWD_STAKING_RPC_URL,
      process.env.VITE_OPENCLAWD_STAKING_RPC_URL,
    ) ?? DEFAULT_OPENCLAWD_STAKING_RPC_URL
  );
}

export function getOpenClawdStakingConnection() {
  return new Connection(getOpenClawdStakingRpcUrl(), "confirmed");
}

export function getClusterName(rpcEndpoint: string) {
  if (rpcEndpoint.includes("mainnet")) return "mainnet-beta";
  if (rpcEndpoint.includes("devnet")) return "devnet";
  if (rpcEndpoint.includes("testnet")) return "testnet";
  return "custom";
}

function getDefaultPublicRpcUrlForCluster(cluster: string) {
  switch (cluster) {
    case "mainnet-beta":
      return "https://api.mainnet-beta.solana.com";
    case "testnet":
      return "https://api.testnet.solana.com";
    case "devnet":
      return DEFAULT_OPENCLAWD_STAKING_PUBLIC_RPC_URL;
    default:
      return DEFAULT_OPENCLAWD_STAKING_PUBLIC_RPC_URL;
  }
}

export function getOpenClawdStakingPublicRpcUrl() {
  return (
    pickFirst(
      process.env.OPENCLAWD_STAKING_PUBLIC_RPC_URL,
      process.env.VITE_OPENCLAWD_STAKING_RPC_URL,
    ) ?? getDefaultPublicRpcUrlForCluster(getClusterName(getOpenClawdStakingRpcUrl()))
  );
}

export async function inspectOpenClawdStakingRuntime() {
  const rpc = getOpenClawdStakingConnection();
  const programId = getOpenClawdStakingProgramId();
  const [poolPda] = PublicKey.findProgramAddressSync(
    [GLOBAL_AUTHORITY_SEED],
    programId,
  );

  const [programInfo, poolInfo] = await Promise.all([
    rpc.getAccountInfo(programId),
    rpc.getAccountInfo(poolPda),
  ]);

  const programDeployed = Boolean(programInfo);
  const poolInitialized = Boolean(poolInfo);

  return {
    rpc,
    programId,
    poolPda,
    programDeployed,
    poolInitialized,
    ready: programDeployed && poolInitialized,
    status: !programDeployed
      ? "program-missing"
      : !poolInitialized
        ? "pool-uninitialized"
        : "ready",
  } as const;
}
