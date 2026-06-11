import { program } from "commander";
import { BN } from "@coral-xyz/anchor";
import {
  initProject,
  stakeAgent,
  unstakeAgent,
  stakeForVerification,
  unstakeVerification,
  checkVerification,
  setClusterConfig,
} from "./scripts";
import {
  CORE_COLLECTION_ADDRESS,
  DEFAULT_DEVNET_RPC,
  MIN_CLAWD_STAKE,
} from "../lib/constant";

// ── Helper: shared options ──────────────────────────────────────────────────

function programCommand(name: string) {
  return program
    .command(name)
    .option("-e, --env <string>", "Solana cluster (mainnet-beta | devnet | localnet)", "devnet")
    .option("-r, --rpc <string>", "Custom RPC URL", DEFAULT_DEVNET_RPC)
    .option(
      "-k, --keypair <string>",
      "Keypair path",
      process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`
    );
}

// ── init ────────────────────────────────────────────────────────────────────

programCommand("init")
  .description("Initialize the global staking pool and CLAWD vault (admin only, once)")
  .action(async (_dir, cmd) => {
    const { env, keypair, rpc } = cmd.opts();
    await setClusterConfig(env, keypair, rpc);
    await initProject();
  });

// ── stake / lock (NFT staking) ──────────────────────────────────────────────

function stakeCommand(name: string) {
  return programCommand(name)
    .description("Stake an OpenClawd agent NFT (Metaplex Core asset)")
    .option("-a, --asset <string>", "Metaplex Core asset address")
    .option("-m, --mint <string>", "Alias for --asset")
    .option(
      "-c, --collection <string>",
      "Metaplex Core collection address",
      CORE_COLLECTION_ADDRESS.toBase58()
    )
    .action(async (_dir, cmd) => {
      const { env, keypair, rpc, mint, asset, collection } = cmd.opts();
      const assetAddress = mint ?? asset;
      await setClusterConfig(env, keypair, rpc);
      if (!assetAddress) {
        console.error("Missing --asset (or --mint) flag");
        process.exit(1);
      }
      await stakeAgent(assetAddress, collection, keypair);
    });
}

function unstakeCommand(name: string) {
  return programCommand(name)
    .description("Unstake an OpenClawd agent NFT")
    .option("-a, --asset <string>", "Metaplex Core asset address")
    .option("-m, --mint <string>", "Alias for --asset")
    .option(
      "-c, --collection <string>",
      "Metaplex Core collection address",
      CORE_COLLECTION_ADDRESS.toBase58()
    )
    .action(async (_dir, cmd) => {
      const { env, keypair, rpc, mint, asset, collection } = cmd.opts();
      const assetAddress = mint ?? asset;
      await setClusterConfig(env, keypair, rpc);
      if (!assetAddress) {
        console.error("Missing --asset (or --mint) flag");
        process.exit(1);
      }
      await unstakeAgent(assetAddress, collection, keypair);
    });
}

stakeCommand("stake");
stakeCommand("lock");
unstakeCommand("unstake");
unstakeCommand("unlock");

// ── verify / unverify (CLAWD token staking) ─────────────────────────────────

programCommand("verify")
  .description(
    "Stake CLAWD tokens to obtain Clawd Verified status on-chain. " +
    `Default stake: ${MIN_CLAWD_STAKE.toString()} base-units (100 CLAWD).`
  )
  .option(
    "-a, --amount <string>",
    "CLAWD base-units to stake (6 decimals, min 100_000_000 = 100 CLAWD)",
    MIN_CLAWD_STAKE.toString()
  )
  .action(async (_dir, cmd) => {
    const { env, keypair, rpc, amount } = cmd.opts();
    await setClusterConfig(env, keypair, rpc);
    const stakeAmount = new BN(amount);
    await stakeForVerification(stakeAmount);
  });

programCommand("unverify")
  .description("Unstake CLAWD tokens and revoke Clawd Verified status")
  .action(async (_dir, cmd) => {
    const { env, keypair, rpc } = cmd.opts();
    await setClusterConfig(env, keypair, rpc);
    await unstakeVerification();
  });

// ── check-verification ──────────────────────────────────────────────────────

programCommand("check-verification")
  .description("Check whether a wallet is Clawd Verified")
  .option("-w, --wallet <string>", "Wallet address to check (defaults to your keypair)")
  .action(async (_dir, cmd) => {
    const { env, keypair, rpc, wallet } = cmd.opts();
    await setClusterConfig(env, keypair, rpc);
    const target = wallet ?? (await import("@solana/web3.js")).Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse((await import("node:fs")).readFileSync(keypair, "utf-8")))
    ).publicKey.toBase58();
    await checkVerification(target);
  });

program.parse(process.argv);
