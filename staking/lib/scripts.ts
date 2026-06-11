import type { Wallet } from "@coral-xyz/anchor";
import * as anchor from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import type { Connection } from "@solana/web3.js";
import { PublicKey, SystemProgram, Transaction as web3Transaction } from "@solana/web3.js";
import { fetchAsset, MPL_CORE_PROGRAM_ID } from "@metaplex-foundation/mpl-core";
import { createSignerFromKeypair, publicKey, signerIdentity } from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import fs from "node:fs";

import {
  CLAWD_MINT,
  CLAWD_VAULT_SEED,
  CLAWD_VERIFIED_SEED,
  GLOBAL_AUTHORITY_SEED,
} from "./constant";

// ── PDA helpers ─────────────────────────────────────────────────────────────

export const findGlobalPoolPda = (programId: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from(GLOBAL_AUTHORITY_SEED)],
    programId
  )[0];

export const findClawdVaultPda = (programId: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from(CLAWD_VAULT_SEED)],
    programId
  )[0];

export const findVerificationRecordPda = (
  agentWallet: PublicKey,
  programId: PublicKey
) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from(CLAWD_VERIFIED_SEED), agentWallet.toBuffer()],
    programId
  )[0];

// ── Initialize ──────────────────────────────────────────────────────────────

export const createInitializeTx = async (
  admin: PublicKey,
  program: anchor.Program,
  clawdMint: PublicKey = CLAWD_MINT
) => {
  const globalPool = findGlobalPoolPda(program.programId);
  const clawdVault = findClawdVaultPda(program.programId);

  console.log("globalPool:", globalPool.toBase58());
  console.log("clawdVault:", clawdVault.toBase58());

  return program.methods
    .initialize()
    .accounts({
      admin,
      globalPool,
      clawdMint,
      clawdVault,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .transaction();
};

// ── NFT staking (existing) ──────────────────────────────────────────────────

export const createStakeAgentTx = async (
  wallet: Wallet,
  assetStr: string,
  collectionStr: string,
  program: anchor.Program,
  connection: Connection,
  keypair: string
) => {
  const json = Uint8Array.from(JSON.parse(fs.readFileSync(keypair, "utf-8")));
  const umi = createUmi(connection.rpcEndpoint, "finalized");
  const keyPair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(json));
  umi.use(signerIdentity(createSignerFromKeypair(umi, keyPair)));

  const asset = publicKey(assetStr);
  const collection = publicKey(collectionStr);
  const assetData = await fetchAsset(umi, asset);

  if (assetData.updateAuthority.address !== collectionStr) {
    throw new Error("collection is incorrect");
  }
  if (assetData.freezeDelegate?.frozen) {
    throw new Error("already staked");
  }
  if (!assetData.freezeDelegate) {
    const userAddress = wallet.publicKey;
    if (assetData.owner !== userAddress.toBase58()) {
      throw new Error("wallet is not the agent asset owner");
    }

    const globalPool = findGlobalPoolPda(program.programId);
    const innerTx = await program.methods
      .stakeAgent()
      .accounts({
        owner: userAddress,
        user: userAddress,
        globalPool,
        asset,
        collection,
        coreProgram: MPL_CORE_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .transaction();

    const tx = new web3Transaction().add(innerTx);
    tx.feePayer = userAddress;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    return (await wallet.signTransaction(tx)).serialize({
      requireAllSignatures: false,
    });
  }
};

export const createUnstakeAgentTx = async (
  wallet: Wallet,
  assetStr: string,
  collectionStr: string,
  program: anchor.Program,
  connection: Connection,
  keypair: string
) => {
  const json = Uint8Array.from(JSON.parse(fs.readFileSync(keypair, "utf-8")));
  const umi = createUmi(connection.rpcEndpoint, "finalized");
  const keyPair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(json));
  umi.use(signerIdentity(createSignerFromKeypair(umi, keyPair)));

  const asset = publicKey(assetStr);
  const collection = publicKey(collectionStr);
  const assetData = await fetchAsset(umi, asset);

  if (assetData.updateAuthority.address !== collectionStr) {
    throw new Error("collection is incorrect");
  }
  if (!assetData.freezeDelegate) {
    throw new Error("asset is not staked");
  }

  const userAddress = wallet.publicKey;
  const ownerAddress = new PublicKey(assetData.owner);
  const globalPool = findGlobalPoolPda(program.programId);

  const innerTx = await program.methods
    .unstakeAgent()
    .accounts({
      owner: ownerAddress,
      user: userAddress,
      globalPool,
      asset,
      collection,
      coreProgram: MPL_CORE_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .transaction();

  const tx = new web3Transaction().add(innerTx);
  tx.feePayer = userAddress;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  return (await wallet.signTransaction(tx)).serialize({
    requireAllSignatures: false,
  });
};

// ── Clawd Verified staking ──────────────────────────────────────────────────

/**
 * Build a transaction that stakes CLAWD tokens to obtain Clawd Verified status.
 *
 * The agent's wallet must hold >= `amount` CLAWD base-units (6 decimals).
 * On-chain success creates a ClawdVerificationRecord PDA at
 * ["clawd-verified", agentWallet] which any program can query permissionlessly.
 *
 * Minimum stake: 100_000_000 base-units (100 CLAWD).
 */
export const createStakeForVerificationTx = async (
  agentWallet: PublicKey,
  amount: anchor.BN,
  program: anchor.Program,
  connection: Connection
) => {
  const globalPool = findGlobalPoolPda(program.programId);
  const clawdVault = findClawdVaultPda(program.programId);
  const verificationRecord = findVerificationRecordPda(agentWallet, program.programId);
  const agentClawdAta = await getAssociatedTokenAddress(CLAWD_MINT, agentWallet);

  const tx = new web3Transaction();

  // Create the agent's CLAWD ATA if it doesn't exist yet.
  const ataInfo = await connection.getAccountInfo(agentClawdAta);
  if (!ataInfo) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        agentWallet,
        agentClawdAta,
        agentWallet,
        CLAWD_MINT
      )
    );
  }

  tx.add(
    await program.methods
      .stakeForVerification(amount)
      .accounts({
        agent: agentWallet,
        globalPool,
        verificationRecord,
        agentClawdAta,
        clawdVault,
        clawdMint: CLAWD_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction()
  );

  tx.feePayer = agentWallet;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  return tx;
};

/**
 * Build a transaction that unstakes CLAWD tokens and revokes Clawd Verified status.
 * The full staked amount is returned to the agent's ATA and the badge PDA is closed.
 */
export const createUnstakeVerificationTx = async (
  agentWallet: PublicKey,
  program: anchor.Program,
  connection: Connection
) => {
  const globalPool = findGlobalPoolPda(program.programId);
  const clawdVault = findClawdVaultPda(program.programId);
  const verificationRecord = findVerificationRecordPda(agentWallet, program.programId);
  const agentClawdAta = await getAssociatedTokenAddress(CLAWD_MINT, agentWallet);

  const tx = new web3Transaction();
  tx.add(
    await program.methods
      .unstakeVerification()
      .accounts({
        agent: agentWallet,
        globalPool,
        verificationRecord,
        agentClawdAta,
        clawdVault,
        clawdMint: CLAWD_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction()
  );

  tx.feePayer = agentWallet;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  return tx;
};

/**
 * Derive the verification record PDA and return the agent's Clawd Verified status.
 * Returns null if the agent has never staked or has unstaked.
 */
export const getVerificationStatus = async (
  agentWallet: PublicKey,
  program: anchor.Program
): Promise<{
  isVerified: boolean;
  stakeAmount: anchor.BN | null;
  verifiedAt: anchor.BN | null;
}> => {
  const pda = findVerificationRecordPda(agentWallet, program.programId);
  type VerificationRecord = { isActive: boolean; stakeAmount: anchor.BN; verifiedAt: anchor.BN };
  type ProgramAccounts = Record<string, { fetch(addr: PublicKey): Promise<VerificationRecord> }>;
  try {
    const record = await (program.account as unknown as ProgramAccounts)
      .clawdVerificationRecord.fetch(pda);
    return {
      isVerified: record.isActive,
      stakeAmount: record.stakeAmount,
      verifiedAt: record.verifiedAt,
    };
  } catch {
    return { isVerified: false, stakeAmount: null, verifiedAt: null };
  }
};

export const createLockCorenftTx = createStakeAgentTx;
export const createUnlockCorenftTx = createUnstakeAgentTx;
