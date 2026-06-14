import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PublicKey, SystemProgram, Transaction, type TransactionInstruction } from "@solana/web3.js";

export const DEFAULT_CLAWD_PROTOCOL_PROGRAM_ID = new PublicKey(
  "CLAWDpRoToCoLv1pRoGRaM111111111111111111111"
);

export const CLAWD_PROTOCOL_PROGRAM_ENV_KEYS = [
  "CLAWD_PROTOCOL_PROGRAM_ID",
  "PUBLIC_CLAWD_PROTOCOL_PROGRAM_ID",
  "VITE_CLAWD_PROTOCOL_PROGRAM_ID",
] as const;

export const CLAWD_CONSTITUTION_HASH_ENV_KEYS = [
  "CLAWD_AGENT_CONSTITUTION_SHA256",
  "CLAWD_CONSTITUTION_SHA256",
] as const;

export const CLAWD_CONSTITUTION_PATH_ENV_KEYS = [
  "CLAWD_AGENT_CONSTITUTION_PATH",
  "CLAWD_CONSTITUTION_PATH",
] as const;

export const ClawdAgentCapability = {
  TRADING: 0x01n,
  SPAWNING: 0x02n,
  PAYMENTS: 0x04n,
  RESEARCH: 0x08n,
  GOVERNANCE: 0x10n,
  BURN_TRIGGER: 0x20n,
} as const;

export const DEFAULT_CLAWD_AGENT_CAPABILITIES =
  ClawdAgentCapability.TRADING |
  ClawdAgentCapability.RESEARCH |
  ClawdAgentCapability.PAYMENTS |
  ClawdAgentCapability.BURN_TRIGGER;

const AGENT_SEED = Buffer.from("agent");

export interface ClawdAgentBindingOptions {
  enabled?: boolean;
  programId?: PublicKey | string;
  agentWallet?: PublicKey | string;
  authority?: PublicKey | string;
  character?: string | object;
  characterHash?: Uint8Array | Buffer | string;
  constitutionText?: string;
  constitutionHash?: Uint8Array | Buffer | string;
  capabilities?: bigint;
}

export interface AppendClawdAgentBindingArgs extends ClawdAgentBindingOptions {
  transaction: Transaction;
  baseMint: PublicKey | string;
}

export interface ClawdAgentBindingAppendResult {
  appended: true;
  programId: string;
  agentBindingAddress: string;
  agentWallet: string;
  authority: string;
  capabilities: string;
  constitutionHash: string;
  characterHash: string;
}

function readPublicKeyFromEnv(keys: readonly string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (!value) continue;
    return { publicKey: new PublicKey(value), source: key };
  }
  return null;
}

function readHashFromEnv(keys: readonly string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (!value) continue;
    return { hash: parseHash32(value, key), source: key };
  }
  return null;
}

function readConstitutionHashFromFile() {
  const candidates = [
    ...CLAWD_CONSTITUTION_PATH_ENV_KEYS
      .map((key) => process.env[key]?.trim())
      .filter((value): value is string => Boolean(value)),
    path.resolve(process.cwd(), "../solana-clawd/three-laws.md"),
    path.resolve(process.cwd(), "three-laws.md"),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    return {
      hash: hashClawdConstitution(readFileSync(candidate, "utf8")),
      source: candidate,
    };
  }
  return null;
}

function parseHash32(value: Uint8Array | Buffer | string, label: string): Uint8Array {
  if (typeof value !== "string") {
    if (value.length !== 32) throw new Error(`${label} must be 32 bytes`);
    return new Uint8Array(value);
  }

  const trimmed = value.trim();
  const hex = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
  if (/^[0-9a-fA-F]{64}$/.test(hex)) {
    return new Uint8Array(Buffer.from(hex, "hex"));
  }

  const base64 = Buffer.from(trimmed, "base64");
  if (base64.length === 32) return new Uint8Array(base64);

  throw new Error(`${label} must be a 32-byte hash encoded as hex or base64`);
}

function hashBytes(value: string): Uint8Array {
  return new Uint8Array(createHash("sha256").update(value, "utf8").digest());
}

function hashToHex(value: Uint8Array): string {
  return Buffer.from(value).toString("hex");
}

export function getConfiguredClawdProtocolProgramId() {
  return readPublicKeyFromEnv(CLAWD_PROTOCOL_PROGRAM_ENV_KEYS);
}

export function getConfiguredClawdConstitutionHash() {
  return readHashFromEnv(CLAWD_CONSTITUTION_HASH_ENV_KEYS) ?? readConstitutionHashFromFile();
}

export function hashClawdConstitution(content: string): Uint8Array {
  return hashBytes(content);
}

export function hashClawdCharacter(character: string | object): Uint8Array {
  const content = typeof character === "string" ? character : JSON.stringify(character);
  return hashBytes(content);
}

export function deriveClawdAgentBindingPda(
  agentWallet: PublicKey | string,
  programId: PublicKey | string = DEFAULT_CLAWD_PROTOCOL_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [AGENT_SEED, new PublicKey(agentWallet).toBuffer()],
    new PublicKey(programId)
  );
}

export function buildClawdRegisterAgentBindingInstruction(args: {
  baseMint: PublicKey | string;
  agentWallet: PublicKey | string;
  authority: PublicKey | string;
  characterHash: Uint8Array | Buffer | string;
  constitutionHash: Uint8Array | Buffer | string;
  capabilities: bigint;
  programId?: PublicKey | string;
}): TransactionInstruction {
  const programId = new PublicKey(args.programId ?? DEFAULT_CLAWD_PROTOCOL_PROGRAM_ID);
  const agentWallet = new PublicKey(args.agentWallet);
  const authority = new PublicKey(args.authority);
  const [agentBinding] = deriveClawdAgentBindingPda(agentWallet, programId);
  const characterHash = parseHash32(args.characterHash, "characterHash");
  const constitutionHash = parseHash32(args.constitutionHash, "constitutionHash");

  const data = Buffer.alloc(8 + 32 + 32 + 8);
  Buffer.from([14, 0, 0, 0, 0, 0, 0, 0]).copy(data, 0);
  let offset = 8;
  Buffer.from(characterHash).copy(data, offset);
  offset += 32;
  Buffer.from(constitutionHash).copy(data, offset);
  offset += 32;
  data.writeBigUInt64LE(args.capabilities, offset);

  return {
    programId,
    keys: [
      { pubkey: agentBinding, isSigner: false, isWritable: true },
      { pubkey: new PublicKey(args.baseMint), isSigner: false, isWritable: false },
      { pubkey: agentWallet, isSigner: true, isWritable: false },
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  };
}

export function appendClawdAgentBindingInstruction(
  args: AppendClawdAgentBindingArgs
): ClawdAgentBindingAppendResult | null {
  if (args.enabled === false) return null;

  const configuredProgram = args.programId
    ? { publicKey: new PublicKey(args.programId), source: "request" }
    : getConfiguredClawdProtocolProgramId();
  if (!configuredProgram) return null;

  const configuredConstitution = args.constitutionHash
    ? { hash: parseHash32(args.constitutionHash, "constitutionHash"), source: "request" }
    : args.constitutionText
      ? { hash: hashClawdConstitution(args.constitutionText), source: "request" }
      : getConfiguredClawdConstitutionHash();
  if (!configuredConstitution) return null;

  const agentWalletInput = args.agentWallet ?? args.authority;
  if (!agentWalletInput) return null;

  const agentWallet = new PublicKey(agentWalletInput);
  const authority = new PublicKey(args.authority ?? agentWallet);
  const characterHash = args.characterHash
    ? parseHash32(args.characterHash, "characterHash")
    : hashClawdCharacter(args.character ?? { agentWallet: agentWallet.toBase58() });
  const capabilities = args.capabilities ?? DEFAULT_CLAWD_AGENT_CAPABILITIES;

  args.transaction.add(
    buildClawdRegisterAgentBindingInstruction({
      baseMint: args.baseMint,
      agentWallet,
      authority,
      characterHash,
      constitutionHash: configuredConstitution.hash,
      capabilities,
      programId: configuredProgram.publicKey,
    })
  );

  const [agentBinding] = deriveClawdAgentBindingPda(agentWallet, configuredProgram.publicKey);
  return {
    appended: true,
    programId: configuredProgram.publicKey.toBase58(),
    agentBindingAddress: agentBinding.toBase58(),
    agentWallet: agentWallet.toBase58(),
    authority: authority.toBase58(),
    capabilities: capabilities.toString(),
    constitutionHash: hashToHex(configuredConstitution.hash),
    characterHash: hashToHex(characterHash),
  };
}
