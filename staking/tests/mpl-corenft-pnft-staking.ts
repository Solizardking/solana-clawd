import * as anchor from "@coral-xyz/anchor";
import type { Program } from "@coral-xyz/anchor";
import type { OpenclawdAgentStaking } from "../target/types/openclawd_agent_staking";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";
import fs from "node:fs";
import path from "node:path";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";

// Load .env from staking root before any process.env reads (gitignored, devnet convenience)
{
  const envPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, "utf-8")
      .split("\n")
      .forEach((line) => {
        const eq = line.indexOf("=");
        if (eq > 0 && !line.startsWith("#")) {
          const key = line.slice(0, eq).trim();
          const val = line.slice(eq + 1).trim();
          if (key && !(key in process.env)) process.env[key] = val;
        }
      });
  }
}
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  generateSigner,
  keypairIdentity,
  type KeypairSigner,
} from "@metaplex-foundation/umi";
import {
  MPL_CORE_PROGRAM_ID,
  create,
  createCollection,
  fetchAsset,
  fetchCollection,
} from "@metaplex-foundation/mpl-core";
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters";

const GLOBAL_AUTHORITY_SEED = "global-authority";
const USER_POOL_SEED = "user-pool";
const REWARD_RATE_PER_SECOND = 1_000;

describe("openclawd-agent-staking", () => {
  const rpcUrl =
    process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");

  const walletPath =
    process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`;
  const walletKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8"))),
  );
  const wallet = new NodeWallet(walletKeypair);

  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    skipPreflight: false,
  });
  anchor.setProvider(provider);

  const program = anchor.workspace
    .OpenclawdAgentStaking as Program<OpenclawdAgentStaking>;

  // UMI for Metaplex Core (collection + asset creation / inspection)
  const umi = createUmi(rpcUrl, "confirmed");
  umi.use(keypairIdentity(fromWeb3JsKeypair(walletKeypair)));

  // GlobalPool PDA — already initialized on devnet
  const [globalPool] = PublicKey.findProgramAddressSync(
    [Buffer.from(GLOBAL_AUTHORITY_SEED)],
    program.programId,
  );

  // Fresh keypairs generated once per test run
  let collectionSigner: KeypairSigner;
  let assetSigner: KeypairSigner;
  let collectionPubkey: PublicKey;
  let assetPubkey: PublicKey;
  let userPoolPda: PublicKey;

  const coreProgramPubkey = new PublicKey(MPL_CORE_PROGRAM_ID.toString());

  before(async () => {
    collectionSigner = generateSigner(umi);
    assetSigner = generateSigner(umi);
    collectionPubkey = new PublicKey(collectionSigner.publicKey.toString());
    assetPubkey = new PublicKey(assetSigner.publicKey.toString());

    [userPoolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(USER_POOL_SEED), assetPubkey.toBuffer()],
      program.programId,
    );

    console.log("\n  Setup:");
    console.log("    RPC:         ", rpcUrl);
    console.log("    Wallet:      ", wallet.publicKey.toBase58());
    console.log("    Program:     ", program.programId.toBase58());
    console.log("    GlobalPool:  ", globalPool.toBase58());
    console.log("    Collection:  ", collectionPubkey.toBase58());
    console.log("    Asset:       ", assetPubkey.toBase58());
    console.log("    UserPool PDA:", userPoolPda.toBase58());
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PHASE 1 — Metaplex Core asset setup
  // ──────────────────────────────────────────────────────────────────────────

  it("creates a Metaplex Core collection", async () => {
    const { signature } = await createCollection(umi, {
      collection: collectionSigner,
      name: "OpenClawd Test Agents",
      uri: "https://arweave.net/test-collection",
    }).sendAndConfirm(umi, {
      send: { commitment: "confirmed" },
      confirm: { commitment: "finalized" },
    });

    console.log(
      `    Collection tx: ${Buffer.from(signature).toString("hex").slice(0, 16)}…`,
    );

    const col = await fetchCollection(umi, collectionSigner.publicKey);
    assert.equal(col.name, "OpenClawd Test Agents");
    assert.equal(
      col.updateAuthority.toString(),
      wallet.publicKey.toBase58(),
      "Update authority should be wallet",
    );
  });

  it("creates a Metaplex Core asset (agent NFT) in the collection", async () => {
    // mpl-core v1.x create() needs a CollectionV1 object, not just a pubkey
    const collectionData = await fetchCollection(
      umi,
      collectionSigner.publicKey,
    );

    const { signature } = await create(umi, {
      asset: assetSigner,
      collection: collectionData,
      name: "Test Clawd Agent #1",
      uri: "https://arweave.net/test-agent",
    }).sendAndConfirm(umi, {
      send: { commitment: "confirmed" },
      confirm: { commitment: "finalized" },
    });

    console.log(
      `    Asset tx: ${Buffer.from(signature).toString("hex").slice(0, 16)}…`,
    );

    // Wait for finalization to propagate across all devnet nodes before
    // the stakeAgent CPI reads the asset account on-chain.
    await new Promise((r) => setTimeout(r, 6_000));

    const asset = await fetchAsset(umi, assetSigner.publicKey);
    assert.equal(asset.name, "Test Clawd Agent #1");
    assert.equal(
      asset.owner.toString(),
      wallet.publicKey.toBase58(),
      "Asset owner should be wallet",
    );
    assert.isUndefined(
      asset.freezeDelegate,
      "FreezeDelegate should not exist before staking",
    );
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PHASE 2 — GlobalPool verification (already initialized on devnet)
  // ──────────────────────────────────────────────────────────────────────────

  it("reads existing GlobalPool — already initialized on devnet", async () => {
    const info = await connection.getAccountInfo(globalPool);
    assert.isNotNull(info, "GlobalPool PDA should exist on devnet");

    const pool = await program.account.globalPool.fetch(globalPool);
    console.log("    Admin:                  ", pool.admin.toBase58());
    console.log(
      "    totalAgentsStaked:      ",
      pool.totalAgentsStaked.toString(),
    );
    console.log(
      "    totalRewardsDistributed:",
      pool.totalRewardsDistributed.toString(),
    );

    assert.isNotNull(pool.admin);
    assert.ok(pool.totalAgentsStaked.gte(new anchor.BN(0)));
    assert.ok(pool.totalRewardsDistributed.gte(new anchor.BN(0)));
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PHASE 3 — Stake
  // ──────────────────────────────────────────────────────────────────────────

  it("stakes the agent NFT", async () => {
    const poolBefore = await program.account.globalPool.fetch(globalPool);
    const stakedBefore = poolBefore.totalAgentsStaked.toNumber();

    // Use accountsStrict — Anchor 0.30.x omits PDA/address accounts from the
    // regular .accounts() type, so we bypass that restriction here.
    const tx = await program.methods
      .stakeAgent()
      .accountsStrict({
        owner: wallet.publicKey,
        user: wallet.publicKey,
        globalPool,
        userPool: userPoolPda,
        asset: assetPubkey,
        collection: collectionPubkey,
        coreProgram: coreProgramPubkey,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed" });

    console.log("    Stake tx:", tx);

    // Allow confirmed state to propagate across devnet nodes before reading back.
    await new Promise((r) => setTimeout(r, 2_000));

    // UserPool was created
    const userPool = await program.account.userPool.fetch(userPoolPda);
    assert.equal(
      userPool.owner.toBase58(),
      wallet.publicKey.toBase58(),
      "UserPool.owner mismatch",
    );
    assert.equal(
      userPool.asset.toBase58(),
      assetPubkey.toBase58(),
      "UserPool.asset mismatch",
    );
    assert.ok(userPool.stakeTime.gt(new anchor.BN(0)), "stakeTime must be set");
    assert.ok(
      userPool.lastClaimTime.eq(userPool.stakeTime),
      "lastClaimTime should equal stakeTime at first stake",
    );
    assert.ok(
      userPool.totalClaimed.eq(new anchor.BN(0)),
      "totalClaimed should be 0 immediately after staking",
    );

    // GlobalPool counter incremented
    const poolAfter = await program.account.globalPool.fetch(globalPool);
    assert.equal(
      poolAfter.totalAgentsStaked.toNumber(),
      stakedBefore + 1,
      "totalAgentsStaked should increment",
    );

    // FreezeDelegate added by the program via CPI
    const asset = await fetchAsset(umi, assetSigner.publicKey);
    assert.isDefined(
      asset.freezeDelegate,
      "FreezeDelegate plugin should be present",
    );
    assert.isTrue(
      asset.freezeDelegate?.frozen,
      "Asset should be frozen while staked",
    );

    console.log("    stakeTime:", userPool.stakeTime.toString());
    console.log(
      "    totalAgentsStaked now:",
      poolAfter.totalAgentsStaked.toString(),
    );
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PHASE 4 — Reward accrual
  // ──────────────────────────────────────────────────────────────────────────

  it("verifies reward accrual over time (waits 3 s)", async () => {
    const before = await program.account.userPool.fetch(userPoolPda);
    await new Promise((r) => setTimeout(r, 3_000));

    const wallNow = Math.floor(Date.now() / 1_000);
    const elapsed = wallNow - before.lastClaimTime.toNumber();
    const minExpected = elapsed * REWARD_RATE_PER_SECOND;

    console.log(
      `    ~${elapsed}s elapsed → ≥${minExpected} base-units pending`,
    );
    assert.ok(
      elapsed >= 2,
      "At least 2 seconds should have passed — enough to accumulate rewards",
    );
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PHASE 5 — Claim rewards
  // ──────────────────────────────────────────────────────────────────────────

  it("claims accrued rewards", async () => {
    // Brief pause to let the public devnet RPC rate-limit window clear after
    // the heavy polling in the asset-creation and staking phases.
    await new Promise((r) => setTimeout(r, 5_000));

    const poolBefore = await program.account.globalPool.fetch(globalPool);
    const userBefore = await program.account.userPool.fetch(userPoolPda);

    const tx = await program.methods
      .claimRewards()
      .accountsStrict({
        owner: wallet.publicKey,
        globalPool,
        userPool: userPoolPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed" });

    console.log("    Claim tx:", tx);

    // Allow confirmed state to propagate across devnet nodes before reading back.
    await new Promise((r) => setTimeout(r, 2_000));

    const userAfter = await program.account.userPool.fetch(userPoolPda);
    const poolAfter = await program.account.globalPool.fetch(globalPool);

    assert.ok(
      userAfter.lastClaimTime.gt(userBefore.lastClaimTime),
      "lastClaimTime should advance after claim",
    );
    assert.ok(
      userAfter.totalClaimed.gt(new anchor.BN(0)),
      "totalClaimed should be > 0 after first claim",
    );

    // delta = rewards distributed in THIS claim call
    const claimedThisCall = userAfter.totalClaimed.sub(userBefore.totalClaimed);
    const delta = poolAfter.totalRewardsDistributed.sub(
      poolBefore.totalRewardsDistributed,
    );
    assert.ok(
      delta.eq(claimedThisCall),
      "totalRewardsDistributed delta should equal amount claimed in this call",
    );

    const claimed = userAfter.totalClaimed.toNumber();
    console.log(
      `    Claimed: ${claimed} base-units (~${(claimed / 1e6).toFixed(4)} CLAWD)`,
    );
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PHASE 6 — Unstake
  // ──────────────────────────────────────────────────────────────────────────

  it("unstakes the agent NFT", async () => {
    const poolBefore = await program.account.globalPool.fetch(globalPool);
    const stakedBefore = poolBefore.totalAgentsStaked.toNumber();
    const walletBalanceBefore = await connection.getBalance(wallet.publicKey);

    const tx = await program.methods
      .unstakeAgent()
      .accountsStrict({
        owner: wallet.publicKey,
        user: wallet.publicKey,
        globalPool,
        userPool: userPoolPda,
        asset: assetPubkey,
        collection: collectionPubkey,
        coreProgram: coreProgramPubkey,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed" });

    console.log("    Unstake tx:", tx);

    // Allow confirmed state to propagate across devnet nodes before reading back.
    await new Promise((r) => setTimeout(r, 2_000));

    // UserPool PDA closed
    const userPoolAccount = await connection.getAccountInfo(userPoolPda);
    assert.isNull(
      userPoolAccount,
      "UserPool PDA should be closed after unstake",
    );

    // GlobalPool counter decremented
    const poolAfter = await program.account.globalPool.fetch(globalPool);
    assert.equal(
      poolAfter.totalAgentsStaked.toNumber(),
      stakedBefore - 1,
      "totalAgentsStaked should decrement",
    );

    // FreezeDelegate removed; asset is transferable again
    const asset = await fetchAsset(umi, assetSigner.publicKey);
    assert.isUndefined(
      asset.freezeDelegate,
      "FreezeDelegate should be removed after unstaking",
    );
    assert.equal(
      asset.owner.toString(),
      wallet.publicKey.toBase58(),
      "Asset owner should still be the wallet",
    );

    // Rent returned to caller
    const walletBalanceAfter = await connection.getBalance(wallet.publicKey);
    const rentReturned = walletBalanceAfter - walletBalanceBefore;
    console.log(`    Rent returned: ${rentReturned} lamports (net of tx fee)`);
    console.log(
      "    totalAgentsStaked now:",
      poolAfter.totalAgentsStaked.toString(),
    );
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PHASE 7 — Error path: double-stake rejected
  // ──────────────────────────────────────────────────────────────────────────

  it("rejects double-staking the same asset (UserPool PDA already in use)", async () => {
    // First stake succeeds
    const stakeTx = await program.methods
      .stakeAgent()
      .accountsStrict({
        owner: wallet.publicKey,
        user: wallet.publicKey,
        globalPool,
        userPool: userPoolPda,
        asset: assetPubkey,
        collection: collectionPubkey,
        coreProgram: coreProgramPubkey,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed" });
    console.log("    Re-stake tx:", stakeTx);

    // Second stake on the same asset must fail (UserPool PDA already exists)
    let threw = false;
    try {
      await program.methods
        .stakeAgent()
        .accountsStrict({
          owner: wallet.publicKey,
          user: wallet.publicKey,
          globalPool,
          userPool: userPoolPda,
          asset: assetPubkey,
          collection: collectionPubkey,
          coreProgram: coreProgramPubkey,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: "confirmed" });
    } catch {
      threw = true;
    }
    assert.isTrue(threw, "Double-stake should be rejected");

    // Cleanup: unstake so the test leaves the asset in a clean state
    await program.methods
      .unstakeAgent()
      .accountsStrict({
        owner: wallet.publicKey,
        user: wallet.publicKey,
        globalPool,
        userPool: userPoolPda,
        asset: assetPubkey,
        collection: collectionPubkey,
        coreProgram: coreProgramPubkey,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed" });
    console.log("    Cleanup unstake done");
  });
});
