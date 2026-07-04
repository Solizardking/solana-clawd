import fs from "node:fs";
import * as anchor from "@coral-xyz/anchor";
import type { Wallet } from "@coral-xyz/anchor";
import { fetchAsset, MPL_CORE_PROGRAM_ID } from "@metaplex-foundation/mpl-core";
import {
  createSignerFromKeypair,
  publicKey,
  signerIdentity,
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  type Connection,
  PublicKey,
  SystemProgram,
  Transaction as web3Transaction,
} from "@solana/web3.js";

import {
  GLOBAL_AUTHORITY_SEED,
  REWARD_RATE_BASE_UNITS_PER_SECOND,
  USER_POOL_SEED,
} from "./constant";

export const findGlobalPoolPda = (programId: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from(GLOBAL_AUTHORITY_SEED)],
    programId,
  )[0];

export const findUserPoolPda = (programId: PublicKey, asset: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from(USER_POOL_SEED), asset.toBuffer()],
    programId,
  )[0];

function keyToString(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof (value as { toString?: () => string }).toString === "function") {
    return (value as { toString(): string }).toString();
  }
  return String(value);
}

function extractCollectionAddress(updateAuthority: unknown): string | null {
  const authority = updateAuthority as
    | {
        type?: string;
        address?: { toString(): string } | string;
        __kind?: string;
        fields?: unknown[];
      }
    | undefined;

  if (authority?.type === "Collection" && authority.address) {
    return authority.address.toString();
  }
  if (
    authority?.__kind === "Collection" &&
    Array.isArray(authority.fields) &&
    authority.fields[0]
  ) {
    return String(authority.fields[0]);
  }
  return null;
}

function buildCliUmi(connection: Connection, keypair: string) {
  const json = Uint8Array.from(JSON.parse(fs.readFileSync(keypair, "utf-8")));
  const umi = createUmi(connection.rpcEndpoint, "finalized");
  const umiKeypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(json));
  umi.use(signerIdentity(createSignerFromKeypair(umi, umiKeypair)));
  return umi;
}

async function fetchCliAsset(
  assetStr: string,
  connection: Connection,
  keypair: string,
) {
  const umi = buildCliUmi(connection, keypair);
  const asset = publicKey(assetStr);
  const assetData = await fetchAsset(umi, asset);
  return { assetData, assetPubkey: new PublicKey(assetStr) };
}

function resolveCollectionAddress(
  assetData: Awaited<ReturnType<typeof fetchAsset>>,
  requestedCollection?: string,
) {
  const derivedCollection = extractCollectionAddress(assetData.updateAuthority);
  const collectionAddress = requestedCollection ?? derivedCollection;

  if (!collectionAddress) {
    throw new Error(
      "asset is not collection-backed, so the staking program cannot lock it",
    );
  }
  if (
    requestedCollection &&
    derivedCollection &&
    requestedCollection !== derivedCollection
  ) {
    throw new Error("collection is incorrect");
  }

  return collectionAddress;
}

async function buildSignedTransaction(
  wallet: Wallet,
  connection: Connection,
  innerTx: web3Transaction,
) {
  const tx = new web3Transaction().add(innerTx);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  return (await wallet.signTransaction(tx)).serialize({
    requireAllSignatures: false,
  });
}

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
  collectionStr: string | undefined,
  program: anchor.Program,
  connection: Connection,
  keypair: string,
) => {
  const { assetData, assetPubkey } = await fetchCliAsset(
    assetStr,
    connection,
    keypair,
  );
  const collectionAddress = resolveCollectionAddress(assetData, collectionStr);

  if (assetData.freezeDelegate?.frozen) {
    throw new Error("already staked");
  }

  const userAddress = wallet.publicKey;
  if (keyToString(assetData.owner) !== userAddress.toBase58()) {
    throw new Error("wallet is not the agent asset owner");
  }

  const collection = new PublicKey(collectionAddress);
  const globalPool = findGlobalPoolPda(program.programId);
  const userPool = findUserPoolPda(program.programId, assetPubkey);
  const innerTx = await program.methods
    .stakeAgent()
    .accountsStrict({
      owner: userAddress,
      user: userAddress,
      globalPool,
      userPool,
      asset: assetPubkey,
      collection,
      coreProgram: new PublicKey(MPL_CORE_PROGRAM_ID.toString()),
      systemProgram: SystemProgram.programId,
    })
    .transaction();

  return buildSignedTransaction(wallet, connection, innerTx);
};

export const createUnstakeAgentTx = async (
  wallet: Wallet,
  assetStr: string,
  collectionStr: string | undefined,
  program: anchor.Program,
  connection: Connection,
  keypair: string,
) => {
  const { assetData, assetPubkey } = await fetchCliAsset(
    assetStr,
    connection,
    keypair,
  );
  const collectionAddress = resolveCollectionAddress(assetData, collectionStr);

  if (!assetData.freezeDelegate?.frozen) {
    throw new Error("asset is not staked");
  }

  const userAddress = wallet.publicKey;
  const ownerAddress = new PublicKey(keyToString(assetData.owner));
  const collection = new PublicKey(collectionAddress);
  const globalPool = findGlobalPoolPda(program.programId);
  const userPool = findUserPoolPda(program.programId, assetPubkey);

  const innerTx = await program.methods
    .unstakeAgent()
    .accountsStrict({
      owner: ownerAddress,
      user: userAddress,
      globalPool,
      userPool,
      asset: assetPubkey,
      collection,
      coreProgram: new PublicKey(MPL_CORE_PROGRAM_ID.toString()),
      systemProgram: SystemProgram.programId,
    })
    .transaction();

  return buildSignedTransaction(wallet, connection, innerTx);
};

export const createLockCorenftTx = createStakeAgentTx;
export const createUnlockCorenftTx = createUnstakeAgentTx;

export const createClaimRewardsTx = async (
  wallet: Wallet,
  assetStr: string,
  program: anchor.Program,
  connection: Connection,
  keypair: string,
) => {
  const { assetPubkey } = await fetchCliAsset(assetStr, connection, keypair);
  const userPool = findUserPoolPda(program.programId, assetPubkey);
  const userPoolInfo = await connection.getAccountInfo(userPool);

  if (!userPoolInfo) {
    throw new Error("asset is not currently staked");
  }

  const globalPool = findGlobalPoolPda(program.programId);
  const innerTx = await program.methods
    .claimRewards()
    .accountsStrict({
      owner: wallet.publicKey,
      globalPool,
      userPool,
      systemProgram: SystemProgram.programId,
    })
    .transaction();

  return buildSignedTransaction(wallet, connection, innerTx);
};

export const getStakeStatus = async (
  assetStr: string,
  program: anchor.Program,
  connection: Connection,
  keypair: string,
) => {
  const { assetData, assetPubkey } = await fetchCliAsset(
    assetStr,
    connection,
    keypair,
  );
  const userPool = findUserPoolPda(program.programId, assetPubkey);
  const userPoolInfo = await connection.getAccountInfo(userPool);
  const collectionAddress = extractCollectionAddress(assetData.updateAuthority);

  if (!userPoolInfo) {
    return {
      assetAddress: assetPubkey.toBase58(),
      assetName: assetData.name,
      owner: keyToString(assetData.owner),
      collectionAddress,
      userPool: userPool.toBase58(),
      freezeDelegateFrozen: Boolean(assetData.freezeDelegate?.frozen),
      staked: false,
    };
  }

  const stakeAccount = await (program.account as any).userPool.fetch(userPool);
  const stakeTime = Number(stakeAccount.stakeTime.toString());
  const lastClaimTime = Number(stakeAccount.lastClaimTime.toString());
  const totalClaimedBaseUnits = Number(stakeAccount.totalClaimed.toString());
  const pendingBaseUnits =
    Math.max(0, Math.floor(Date.now() / 1_000) - lastClaimTime) *
    REWARD_RATE_BASE_UNITS_PER_SECOND;

  return {
    assetAddress: assetPubkey.toBase58(),
    assetName: assetData.name,
    owner: keyToString(assetData.owner),
    collectionAddress,
    userPool: userPool.toBase58(),
    freezeDelegateFrozen: Boolean(assetData.freezeDelegate?.frozen),
    staked: true,
    stakeTime,
    lastClaimTime,
    totalClaimedBaseUnits,
    pendingBaseUnits,
    pendingClawd: pendingBaseUnits / 1_000_000,
  };
};
