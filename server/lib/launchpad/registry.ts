import { PublicKey, Transaction } from "@solana/web3.js";
import {
  AmmRoute,
  CHESHIRE_AGENT_TOKEN_FEE_PROFILE,
  CurveRoute,
  FeeRoute,
  LaunchKind,
  PUMP_STYLE_CURVE_SNAPSHOT,
  SOL_MINT,
  buildLaunchManagedTokenInstruction,
  findAgentProfilePda,
  findLaunchRecordPda,
  findLaunchpadConfigPda,
  type CurveSnapshot,
  type FeeProfile,
  type PublicKeyLike,
} from "../../../shared/cheshire-launchpad/sdk";

export { LaunchKind };

export const CHESHIRE_LAUNCHPAD_PROGRAM_ENV_KEYS = [
  "CHESHIRE_LAUNCHPAD_PROGRAM_ID",
  "PUBLIC_CHESHIRE_LAUNCHPAD_PROGRAM_ID",
  "VITE_CHESHIRE_LAUNCHPAD_PROGRAM_ID",
] as const;

const MAX_NAME_BYTES = 64;
const MAX_SYMBOL_BYTES = 16;
const MAX_URI_BYTES = 240;

const METEORA_DBC_DEFAULT_CURVE_SNAPSHOT: CurveSnapshot = {
  ...PUMP_STYLE_CURVE_SNAPSHOT,
  migrationQuoteThreshold: "3000000000",
  migrationFeeLamports: "0",
};

const EMPTY_FEE_PROFILE: FeeProfile = {
  protocolFeeBps: 0,
  creatorFeeBps: 0,
  agentFeeBps: 0,
  referralFeeBps: 0,
  migrationFeeBps: 0,
};

export interface LaunchpadRegistryOptions {
  enabled?: boolean;
  programId?: PublicKeyLike;
  launchKind?: LaunchKind;
  curveRoute?: CurveRoute;
  ammRoute?: AmmRoute;
  feeRoute?: FeeRoute;
  feeProfile?: FeeProfile;
  curveSnapshot?: CurveSnapshot;
  quoteMint?: PublicKeyLike;
  agentProfile?: PublicKeyLike | null;
}

export interface AppendLaunchpadRegistryArgs extends LaunchpadRegistryOptions {
  transaction: Transaction;
  creator: PublicKeyLike;
  tokenMint: PublicKeyLike;
  curvePool: PublicKeyLike;
  name: string;
  symbol: string;
  metadataUri: string;
}

export interface LaunchpadRegistryAppendResult {
  appended: true;
  programId: string;
  configAddress: string;
  launchRecordAddress: string;
  launchKind: LaunchKind;
  curveRoute: CurveRoute;
  ammRoute: AmmRoute;
  feeRoute: FeeRoute;
  quoteMint: string;
  curvePool: string;
  agentProfile: string | null;
}

function readPublicKeyFromEnv(keys: readonly string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (!value) continue;
    return { publicKey: new PublicKey(value), source: key };
  }
  return null;
}

function limitUtf8(value: string, maxBytes: number): string {
  let output = value.trim();
  while (Buffer.byteLength(output, "utf8") > maxBytes) {
    output = output.slice(0, -1);
  }
  return output;
}

export function getConfiguredCheshireLaunchpadProgramId() {
  return readPublicKeyFromEnv(CHESHIRE_LAUNCHPAD_PROGRAM_ENV_KEYS);
}

export function deriveCheshireAgentProfilePda(
  authority: PublicKeyLike,
  agentAsset: PublicKeyLike,
  programId?: PublicKeyLike
): PublicKey {
  return findAgentProfilePda(authority, agentAsset, programId)[0];
}

export function appendLaunchpadRegistryInstruction(
  args: AppendLaunchpadRegistryArgs
): LaunchpadRegistryAppendResult | null {
  if (args.enabled === false) return null;

  const configuredProgram = args.programId
    ? { publicKey: new PublicKey(args.programId), source: "request" }
    : getConfiguredCheshireLaunchpadProgramId();
  if (!configuredProgram) return null;

  const programId = configuredProgram.publicKey;
  const tokenMint = new PublicKey(args.tokenMint);
  const curvePool = new PublicKey(args.curvePool);
  const agentProfile = args.agentProfile ? new PublicKey(args.agentProfile) : null;
  const launchKind = args.launchKind ?? LaunchKind.MeteoraDynamicBondingCurve;
  const curveRoute = args.curveRoute ?? CurveRoute.MeteoraDynamicBondingCurve;
  const ammRoute = args.ammRoute ?? AmmRoute.MeteoraDammV2;
  const quoteMint = args.quoteMint ? new PublicKey(args.quoteMint).toBase58() : SOL_MINT;
  const feeRoute = args.feeRoute ?? (
    launchKind === LaunchKind.AgentToken
      ? FeeRoute.ProtocolCreatorAgent
      : FeeRoute.ProtocolOnly
  );
  const feeProfile = args.feeProfile ?? (
    launchKind === LaunchKind.AgentToken
      ? CHESHIRE_AGENT_TOKEN_FEE_PROFILE
      : EMPTY_FEE_PROFILE
  );
  const curveSnapshot = args.curveSnapshot ?? METEORA_DBC_DEFAULT_CURVE_SNAPSHOT;
  const config = findLaunchpadConfigPda(programId)[0];
  const launchRecord = findLaunchRecordPda(tokenMint, programId)[0];

  args.transaction.add(
    buildLaunchManagedTokenInstruction({
      programId,
      creator: args.creator,
      tokenMint,
      launchKind,
      curveRoute,
      ammRoute,
      feeRoute,
      name: limitUtf8(args.name, MAX_NAME_BYTES),
      symbol: limitUtf8(args.symbol, MAX_SYMBOL_BYTES),
      metadataUri: limitUtf8(args.metadataUri, MAX_URI_BYTES),
      agentProfile,
      curvePool,
      quoteMint,
      feeProfile,
      curveSnapshot,
    })
  );

  return {
    appended: true,
    programId: programId.toBase58(),
    configAddress: config.toBase58(),
    launchRecordAddress: launchRecord.toBase58(),
    launchKind,
    curveRoute,
    ammRoute,
    feeRoute,
    quoteMint,
    curvePool: curvePool.toBase58(),
    agentProfile: agentProfile?.toBase58() ?? null,
  };
}
