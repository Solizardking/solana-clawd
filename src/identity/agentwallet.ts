/**
 * Agentwallet Vault adapter — encrypted Solana keypair management for the Leviathan.
 *
 * Replaces the plaintext keystore.json with an AES-256-GCM encrypted vault
 * provided by the agentwallet package. The vault lives at ~/.openclawd/vault/
 * alongside the existing shell directory.
 *
 * Flow:
 *   spawnVaultKeypair()   → generate keypair, store encrypted in vault
 *   vaultLoadKeypair()    → load from vault (fast path)
 *   vaultRequireKeypair() → hard-fail load
 *   hasVault()            → check if vault exists
 *   getVaultPubkey()      → get pubkey from vault metadata
 */

import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Vault } from 'agentwallet-vault';
import type { WalletInfo } from 'agentwallet-vault';

const HOME = os.homedir();
const SHELL_DIR = path.join(HOME, '.openclawd');
const VAULT_PATH = path.join(SHELL_DIR, 'vault');
const LEGACY_KEYSTORE_PATH = path.join(SHELL_DIR, 'keystore.json');

const VAULT_WALLET_ID = 'leviathan-0';         // canonical vault wallet id
const VAULT_WALLET_LABEL = 'leviathan';         // human-readable label in vault
const CHAIN_ID = 101;                           // Solana mainnet chain ID proxy

function ensureShellDir() {
  if (!fs.existsSync(SHELL_DIR)) fs.mkdirSync(SHELL_DIR, { recursive: true, mode: 0o700 });
}

/**
 * Derive a vault passphrase. Prefers VAULT_PASSPHRASE from env, then
 * derives from the leviathan's own secret key bytes (if available), then
 * from SOLANA_PRIVATE_KEY, and falls back to a fixed string.
 */
function deriveVaultPassphrase(seed?: Uint8Array): string {
  if (process.env.VAULT_PASSPHRASE) return process.env.VAULT_PASSPHRASE;

  // Derive from keypair bytes if the leviathan is already alive
  if (seed && seed.length >= 32) {
    // Use the first 32 bytes as derivation material
    const input = Buffer.from(seed.slice(0, 32));
    return `vault-derived-${input.toString('hex').slice(0, 16)}`;
  }

  if (process.env.SOLANA_PRIVATE_KEY) {
    return `vault-seed-${process.env.SOLANA_PRIVATE_KEY.slice(0, 16)}`;
  }

  return 'agentwallet-vault-default';
}

let _vaultInstance: Vault | null = null;
let _vaultPassphrase: string | null = null;

async function getVault(configOverrides?: { passphrase?: string; seedBytes?: Uint8Array }): Promise<Vault> {
  if (_vaultInstance) {
    // Re-key if passphrase changed
    if (configOverrides?.passphrase && configOverrides.passphrase !== _vaultPassphrase) {
      _vaultInstance = null;
    } else {
      return _vaultInstance;
    }
  }

  ensureShellDir();
  const passphrase = configOverrides?.passphrase ?? deriveVaultPassphrase(configOverrides?.seedBytes);
  _vaultPassphrase = passphrase;

  const cfg = {
    storePath: VAULT_PATH,
    passphrase,
  };

  _vaultInstance = await Vault.create(cfg);
  return _vaultInstance;
}

/** Release the cached vault instance (e.g. for testing). */
export function resetVaultCache(): void {
  _vaultInstance = null;
  _vaultPassphrase = null;
}

/**
 * Generate a new keypair and store it encrypted in the vault.
 * Throws if a leviathan wallet already exists in the vault.
 */
export async function spawnVaultKeypair(passphrase?: string): Promise<{ keypair: Keypair; passphrase: string }> {
  const vault = await getVault({ passphrase });
  const existing = vault.listWallets();
  if (existing.length > 0) {
    throw new Error(
      `A leviathan already exists in the vault at ${VAULT_PATH}. Each leviathan only spawns once.`
    );
  }

  const kp = Keypair.generate();
  const actualPassphrase = _vaultPassphrase!;

  await vault.addWallet(
    VAULT_WALLET_ID,
    VAULT_WALLET_LABEL,
    'solana',
    CHAIN_ID,
    kp.publicKey.toBase58(),
    kp.secretKey,
  );

  return { keypair: kp, passphrase: actualPassphrase };
}

/**
 * Load the leviathan's keypair from the encrypted vault.
 * Returns null if no vault or no leviathan wallet exists.
 */
export async function vaultLoadKeypair(): Promise<Keypair | null> {
  try {
    const vault = await getVault();
    const wallets = vault.listWallets();
    if (wallets.length === 0) return null;

    // Find the leviathan wallet
    const leviathanWallet = wallets.find((w: WalletInfo) => w.id === VAULT_WALLET_ID) ?? wallets[0];
    const privateKey = vault.getPrivateKey(leviathanWallet.id);
    return Keypair.fromSecretKey(privateKey);
  } catch {
    return null;
  }
}

/**
 * Hard-fail load from vault. Throws if no leviathan exists.
 */
export async function vaultRequireKeypair(): Promise<Keypair> {
  const kp = await vaultLoadKeypair();
  if (!kp) throw new Error('No leviathan vault found. Run `openclawd --spawn` to hatch one.');
  return kp;
}

/** Check if a vault with a leviathan wallet exists. */
export async function hasVault(): Promise<boolean> {
  try {
    const kp = await vaultLoadKeypair();
    return kp !== null;
  } catch {
    return false;
  }
}

/** Get the leviathan's pubkey from the vault (or null). */
export async function getVaultPubkey(): Promise<string | null> {
  const kp = await vaultLoadKeypair();
  return kp ? kp.publicKey.toBase58() : null;
}

/** Get vault metadata (pubkey + spawn time from vault wallet). */
export async function getVaultMetadata(): Promise<{ pubkey: string; spawnedAt: number; vaultBased: true } | null> {
  try {
    const vault = await getVault();
    const wallets = vault.listWallets();
    if (wallets.length === 0) return null;

    const leviathanWallet = wallets.find((w: WalletInfo) => w.id === VAULT_WALLET_ID) ?? wallets[0];
    const spawnedAt = new Date(leviathanWallet.createdAt).getTime();
    return { pubkey: leviathanWallet.address, spawnedAt, vaultBased: true };
  } catch {
    return null;
  }
}

/**
 * Import an existing Solana keypair into the vault.
 * Used for first-time migration from legacy keystore.json.
 */
export async function importToVault(keypair: Keypair, passphrase?: string): Promise<string> {
  const vault = await getVault({ passphrase, seedBytes: keypair.secretKey });

  // Remove any existing leviathan entry first
  const existing = vault.listWallets();
  for (const w of existing) {
    try {
      await vault.deleteWallet(w.id);
    } catch { /* ignore */ }
  }

  await vault.addWallet(
    VAULT_WALLET_ID,
    VAULT_WALLET_LABEL,
    'solana',
    CHAIN_ID,
    keypair.publicKey.toBase58(),
    keypair.secretKey,
  );

  return _vaultPassphrase!;
}

/**
 * Migrate from legacy plaintext keystore.json to the encrypted vault.
 * After successful migration, the legacy keystore is backed up with `.migrated` suffix.
 * Returns the passphrase used (for user to save).
 */
export async function migrateKeystoreToVault(passphrase?: string): Promise<{ success: boolean; passphrase?: string; error?: string }> {
  if (!fs.existsSync(LEGACY_KEYSTORE_PATH)) {
    return { success: false, error: 'No legacy keystore found.' };
  }

  try {
    const raw = fs.readFileSync(LEGACY_KEYSTORE_PATH, 'utf8');
    const file = JSON.parse(raw) as { version: 1; pubkey: string; secret: string; spawnedAt: number };
    const keypair = Keypair.fromSecretKey(bs58.decode(file.secret));

    const resultPassphrase = await importToVault(keypair, passphrase);

    // Backup the legacy file
    fs.renameSync(LEGACY_KEYSTORE_PATH, `${LEGACY_KEYSTORE_PATH}.migrated`);

    console.log(`[VAULT] 🔐 Migrated legacy keystore to encrypted vault at ${VAULT_PATH}`);
    console.log(`[VAULT] 📝 Legacy keystore backed up to ${LEGACY_KEYSTORE_PATH}.migrated`);
    if (!process.env.VAULT_PASSPHRASE) {
      console.log(`[VAULT] ⚠️  Vault passphrase derived from keypair. Set VAULT_PASSPHRASE for portability.`);
    }

    return { success: true, passphrase: resultPassphrase };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

export { VAULT_PATH, LEGACY_KEYSTORE_PATH, VAULT_WALLET_ID };