import * as anchor from "@coral-xyz/anchor";
import fs from "node:fs";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { PROGRAM_ID, CLAWD_MINT, MIN_CLAWD_STAKE } from "../lib/constant";
import {
  ComputeBudgetProgram,
  type Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";

import {
  createInitializeTx,
  createStakeAgentTx,
  createUnstakeAgentTx,
  createStakeForVerificationTx,
  createUnstakeVerificationTx,
  findVerificationRecordPda,
  getVerificationStatus,
} from "../lib/scripts";
import { OPENCLAWD_AGENT_STAKING_IDL } from "../lib/idl";

let solConnection: Connection = null;
let program: anchor.Program = null;
let provider: anchor.Provider = null;
let payer: NodeWallet = null;

const programId = new anchor.web3.PublicKey(PROGRAM_ID);

export const setClusterConfig = async (
  cluster: anchor.web3.Cluster,
  keypair: string,
  rpc?: string
) => {
  solConnection = rpc
    ? new anchor.web3.Connection(rpc)
    : new anchor.web3.Connection(anchor.web3.clusterApiUrl(cluster));

  const walletKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(keypair, "utf-8"))),
    { skipValidation: true }
  );
  const wallet = new NodeWallet(walletKeypair);

  anchor.setProvider(
    new anchor.AnchorProvider(solConnection, wallet, {
      skipPreflight: false,
      commitment: "confirmed",
    })
  );
  payer = wallet;
  provider = anchor.getProvider();
  console.log("Wallet:", wallet.publicKey.toBase58());
  console.log("Program:", programId.toBase58());

  program = new anchor.Program(OPENCLAWD_AGENT_STAKING_IDL, provider);
};

export const initProject = async () => {
  try {
    const updateCpIx = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 5_000_000,
    });
    const updateCuIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: 200_000,
    });

    const tx = new Transaction().add(
      updateCpIx,
      updateCuIx,
      await createInitializeTx(payer.publicKey, program, CLAWD_MINT)
    );
    const { blockhash } = await solConnection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = payer.publicKey;

    const txId = await solConnection.sendTransaction(tx, [payer.payer], {
      preflightCommitment: "confirmed",
    });
    await solConnection.confirmTransaction(txId, "confirmed");
    console.log("Initialized. txHash:", txId);
  } catch (e) {
    console.error("init error:", e);
  }
};

export const stakeAgent = async (
  asset: string,
  collection: string,
  keypair: string
) => {
  try {
    const tx = await createStakeAgentTx(
      payer as anchor.Wallet,
      asset,
      collection,
      program,
      solConnection,
      keypair
    );
    await addAdminSignAndConfirm(tx);
  } catch (e) {
    console.error(e);
  }
};

export const unstakeAgent = async (
  asset: string,
  collection: string,
  keypair: string
) => {
  try {
    const tx = await createUnstakeAgentTx(
      payer as anchor.Wallet,
      asset,
      collection,
      program,
      solConnection,
      keypair
    );
    await addAdminSignAndConfirm(tx);
  } catch (e) {
    console.error(e);
  }
};

/**
 * Stake CLAWD tokens to obtain Clawd Verified status.
 * Uses MIN_CLAWD_STAKE (100 CLAWD) by default unless `customAmount` is provided.
 */
export const stakeForVerification = async (
  customAmount?: anchor.BN
) => {
  try {
    const amount = customAmount ?? MIN_CLAWD_STAKE;
    console.log(`Staking ${amount.toString()} CLAWD base-units for verification...`);

    const tx = await createStakeForVerificationTx(
      payer.publicKey,
      amount,
      program,
      solConnection
    );
    const sig = await solConnection.sendTransaction(tx, [payer.payer], {
      preflightCommitment: "confirmed",
    });
    await solConnection.confirmTransaction(sig, "confirmed");
    console.log("✓ Clawd Verified! txHash:", sig);

    const pda = findVerificationRecordPda(payer.publicKey, program.programId);
    console.log("Verification badge PDA:", pda.toBase58());
  } catch (e) {
    console.error("verify error:", e);
  }
};

/**
 * Unstake CLAWD tokens and revoke Clawd Verified status.
 */
export const unstakeVerification = async () => {
  try {
    const status = await getVerificationStatus(payer.publicKey, program);
    if (!status.isVerified) {
      console.log("Wallet is not currently Clawd Verified.");
      return;
    }

    console.log(`Unstaking ${status.stakeAmount?.toString()} CLAWD base-units...`);
    const tx = await createUnstakeVerificationTx(
      payer.publicKey,
      program,
      solConnection
    );
    const sig = await solConnection.sendTransaction(tx, [payer.payer], {
      preflightCommitment: "confirmed",
    });
    await solConnection.confirmTransaction(sig, "confirmed");
    console.log("✓ Verification revoked. txHash:", sig);
  } catch (e) {
    console.error("unverify error:", e);
  }
};

/**
 * Check whether a given wallet is currently Clawd Verified.
 */
export const checkVerification = async (walletStr: string) => {
  try {
    const wallet = new PublicKey(walletStr);
    const status = await getVerificationStatus(wallet, program);

    if (status.isVerified) {
      const pda = findVerificationRecordPda(wallet, program.programId);
      console.log("✓ CLAWD VERIFIED");
      console.log("  Badge PDA:", pda.toBase58());
      console.log("  Staked:", status.stakeAmount?.toString(), "base-units");
      console.log("  Verified at:", new Date(Number(status.verifiedAt) * 1000).toISOString());
    } else {
      console.log("✗ Not Clawd Verified");
    }
  } catch (e) {
    console.error("check error:", e);
  }
};

export const lockCorenft = stakeAgent;
export const unlockCorenft = unstakeAgent;

export const addAdminSignAndConfirm = async (txData: Buffer) => {
  const tx = Transaction.from(txData);
  const sTx = tx.serialize();
  const signature = await solConnection.sendRawTransaction(sTx, {
    commitment: "confirmed",
    skipPreflight: false,
  });
  await solConnection.confirmTransaction(signature, "confirmed");
  console.log("Transaction confirmed:", signature);
};
