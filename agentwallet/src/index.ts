/**
 * @agentwallet/core — Main entry point
 * Agentic wallet vault for encrypted Solana + EVM keypair management
 */

// Types
export type {
  ChainType,
  Network,
  WalletEntry,
  WalletInfo,
  VaultConfig,
  ServerConfig,
  E2BSandboxConfig,
  CloudflareConfig,
  SandboxInstance,
  KeypairResult,
  VaultEnvelope,
} from "./types.js";

// Network helpers
export { getRpcUrl, parseNetwork, isMainnet, networkLabel } from "./network.js";

// Vault
export { Vault, defaultVaultConfig } from "./vault.js";

// Crypto utilities
export { deriveKey, encrypt, decrypt, generateId, toHex, fromHex } from "./crypto.js";

// Keypair generation
export {
  generateSolanaKeypair,
  importSolanaKeypair,
  importSolanaKeypairFromBytes,
  generateEVMKeypair,
  importEVMKeypair,
} from "./keygen.js";

// Server
export {
  createVaultRouter,
  startServer,
  defaultServerConfig,
  authMiddleware,
  corsMiddleware,
} from "./server.js";

// Deployment
export {
  E2BDeployer,
  deployToE2B,
  CloudflareDeployer,
  deployToCloudflare,
} from "./deploy/index.js";