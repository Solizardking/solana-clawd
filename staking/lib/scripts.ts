import fs from "node:fs";
import * as anchor from "@coral-xyz/anchor";
import type { Wallet } from "@coral-xyz/anchor";
import { fetchAsset, MPL_CORE_PROGRAM_ID } from "@metaplex-foundation/mpl-core";
import { createSignerFromKeypair, publicKey, signerIdentity } from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { type Connection, PublicKey, SystemProgram, Transaction as web3Transaction } from "@solana/web3.js";

import {
  GLOBAL_AUTHORITY_SEED,
} from "./constant";

export const findGlobalPoolPda = (programId: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from(GLOBAL_AUTHORITY_SEED)],
    programId,
  )[0];

export const createInitializeTx = async (
  admin: PublicKey,
  program: anchor.Program,
) => {
  const globalPool = findGlobalPoolPda(program.programId);

  console.log("globalPool:", globalPool.toBase58());

  return program.methods
    .initialize()
    .accounts({
      admin,
      globalPool,
      systemProgram: SystemProgram.programId,
    })
    .transaction();
};

export const createStakeAgentTx = async (
  wallet: Wallet,
  assetStr: string,
  collectionStr: string,
  program: anchor.Program,
  connection: Connection,
  keypair: string,
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
  keypair: string,
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

export const createLockCorenftTx = createStakeAgentTx;
export const createUnlockCorenftTx = createUnstakeAgentTx;
