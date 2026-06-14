import { PublicKey } from "@solana/web3.js";

export const DBC_FEE_WALLET_ENV_KEYS = [
  "DBC_FEE_WALLET",
  "LAUNCHPAD_FEE_WALLET",
  "TREASURY_WALLET",
  "BURN_WALLET_TREASURY",
  "ADMIN_WALLET",
] as const;

export const DBC_CONFIG_ENV_KEYS = [
  "DBC_CONFIG_ADDRESS",
  "POOL_CONFIG_KEY",
  "PUBLIC_DBC_CONFIG_ADDRESS",
  "METEORA_DBC_CONFIG_ADDRESS",
  "NEXT_PUBLIC_POOL_CONFIG_KEY",
] as const;

export const MPL_CORE_PROGRAM_ID = new PublicKey("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");

export interface ResolvedPublicKey {
  publicKey: PublicKey;
  source: string;
}

function isPlaceholderPublicKey(value: string) {
  return /^(your_|replace-|todo|changeme|<)/i.test(value);
}

function parsePublicKey(value: string, source: string): ResolvedPublicKey {
  try {
    return { publicKey: new PublicKey(value), source };
  } catch {
    throw new Error(`${source} must be a valid Solana public key`);
  }
}

function readPublicKeyFromEnv(keys: readonly string[]): ResolvedPublicKey | null {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value && isPlaceholderPublicKey(value)) continue;
    if (value) return parsePublicKey(value, key);
  }
  return null;
}

export function getConfiguredDbcFeeWallet(): ResolvedPublicKey | null {
  return readPublicKeyFromEnv(DBC_FEE_WALLET_ENV_KEYS);
}

export function resolveDbcFeeWallet(explicit?: string | PublicKey | null): ResolvedPublicKey {
  if (explicit instanceof PublicKey) return { publicKey: explicit, source: "request" };
  if (explicit?.trim()) return parsePublicKey(explicit.trim(), "request.feeClaimer");

  const configured = getConfiguredDbcFeeWallet();
  if (configured) return configured;

  throw new Error(
    `Fee wallet is not configured. Set ${DBC_FEE_WALLET_ENV_KEYS.join(
      " or "
    )}, or pass feeClaimer explicitly.`
  );
}

export function getConfiguredDbcConfigAddress(): ResolvedPublicKey | null {
  return readPublicKeyFromEnv(DBC_CONFIG_ENV_KEYS);
}

export function requireDefaultDbcConfigAddress(explicit?: string | PublicKey | null): ResolvedPublicKey {
  if (explicit instanceof PublicKey) return { publicKey: explicit, source: "request" };
  if (explicit?.trim()) return parsePublicKey(explicit.trim(), "request.configAddress");

  const configured = getConfiguredDbcConfigAddress();
  if (configured) return configured;

  throw new Error(
    `DBC config address is not configured. Set ${DBC_CONFIG_ENV_KEYS.join(
      " or "
    )}, or pass configAddress explicitly.`
  );
}

export function deriveMetaplexCoreAssetSignerPda(asset: string | PublicKey): PublicKey {
  const assetPublicKey = asset instanceof PublicKey ? asset : new PublicKey(asset);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("mpl-core-execute"), assetPublicKey.toBuffer()],
    MPL_CORE_PROGRAM_ID
  )[0];
}
