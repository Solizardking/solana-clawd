import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  DBC_CONFIG_ENV_KEYS,
  DBC_FEE_WALLET_ENV_KEYS,
  MPL_CORE_PROGRAM_ID,
  deriveMetaplexCoreAssetSignerPda,
  getConfiguredDbcConfigAddress,
  getConfiguredDbcFeeWallet,
  requireDefaultDbcConfigAddress,
  resolveDbcFeeWallet,
} from "../server/lib/launchpad/fee-wallet";
import {
  CHESHIRE_LAUNCHPAD_PROGRAM_ENV_KEYS,
  LaunchKind,
  appendLaunchpadRegistryInstruction,
  deriveCheshireAgentProfilePda,
  getConfiguredCheshireLaunchpadProgramId,
} from "../server/lib/launchpad/registry";
import {
  CLAWD_CONSTITUTION_HASH_ENV_KEYS,
  CLAWD_CONSTITUTION_PATH_ENV_KEYS,
  CLAWD_PROTOCOL_PROGRAM_ENV_KEYS,
  DEFAULT_CLAWD_AGENT_CAPABILITIES,
  appendClawdAgentBindingInstruction,
  buildClawdRegisterAgentBindingInstruction,
  deriveClawdAgentBindingPda,
  getConfiguredClawdProtocolProgramId,
  hashClawdCharacter,
  hashClawdConstitution,
} from "../server/lib/launchpad/clawd-sdk";

const originalEnv = { ...process.env };
const payer = new PublicKey("11111111111111111111111111111111");
const treasury = new PublicKey("HKBX8CwMGwnwtFjTH99xKa82whjowqxzsBQGWT3kBhDJ");
const dbcFeeWallet = new PublicKey("EFH1ouVP6ikYgyHm9zaLXSPHJDXsfVcaVLFPjtzw6BbF");
const dbcConfig = new PublicKey("A8gMrEPJkacWkcb3DGwtJwTe16HktSEfvwtuDh2MCtck");
const asset = new PublicKey("So11111111111111111111111111111111111111112");
const cheshireProgram = new PublicKey("FrooSFQWh5uiTCtLgEGBthCkRwQ69Laq7tf9Kaqn3R8G");
const clawdProgram = new PublicKey("CLAWDpRoToCoLv1pRoGRaM111111111111111111111");

function resetLaunchpadEnv() {
  process.env = { ...originalEnv };
  for (const key of [
    ...DBC_FEE_WALLET_ENV_KEYS,
    ...DBC_CONFIG_ENV_KEYS,
    ...CHESHIRE_LAUNCHPAD_PROGRAM_ENV_KEYS,
    ...CLAWD_PROTOCOL_PROGRAM_ENV_KEYS,
    ...CLAWD_CONSTITUTION_HASH_ENV_KEYS,
    ...CLAWD_CONSTITUTION_PATH_ENV_KEYS,
  ]) {
    delete process.env[key];
  }
}

try {
  resetLaunchpadEnv();
  assert.equal(getConfiguredDbcFeeWallet(), null);
  assert.throws(() => resolveDbcFeeWallet(), /Fee wallet is not configured/);
  assert.equal(resolveDbcFeeWallet(payer).publicKey.toBase58(), payer.toBase58());

  process.env.TREASURY_WALLET = treasury.toBase58();
  let feeWallet = resolveDbcFeeWallet();
  assert.equal(feeWallet.publicKey.toBase58(), treasury.toBase58());
  assert.equal(feeWallet.source, "TREASURY_WALLET");

  process.env.DBC_FEE_WALLET = dbcFeeWallet.toBase58();
  feeWallet = getConfiguredDbcFeeWallet()!;
  assert.equal(feeWallet.publicKey.toBase58(), dbcFeeWallet.toBase58());
  assert.equal(feeWallet.source, "DBC_FEE_WALLET");

  assert.equal(getConfiguredDbcConfigAddress(), null);
  assert.throws(() => requireDefaultDbcConfigAddress(), /DBC config address is not configured/);
  process.env.POOL_CONFIG_KEY = "your_pool_config_key";
  assert.equal(getConfiguredDbcConfigAddress(), null);
  delete process.env.POOL_CONFIG_KEY;

  process.env.DBC_CONFIG_ADDRESS = dbcConfig.toBase58();
  const configAddress = requireDefaultDbcConfigAddress();
  assert.equal(configAddress.publicKey.toBase58(), dbcConfig.toBase58());
  assert.equal(configAddress.source, "DBC_CONFIG_ADDRESS");

  delete process.env.DBC_CONFIG_ADDRESS;
  process.env.POOL_CONFIG_KEY = dbcConfig.toBase58();
  const poolConfigAddress = requireDefaultDbcConfigAddress();
  assert.equal(poolConfigAddress.publicKey.toBase58(), dbcConfig.toBase58());
  assert.equal(poolConfigAddress.source, "POOL_CONFIG_KEY");

  const expectedAssetSigner = PublicKey.findProgramAddressSync(
    [Buffer.from("mpl-core-execute"), asset.toBuffer()],
    MPL_CORE_PROGRAM_ID
  )[0];
  assert.equal(deriveMetaplexCoreAssetSignerPda(asset).toBase58(), expectedAssetSigner.toBase58());

  assert.equal(getConfiguredCheshireLaunchpadProgramId(), null);
  const txWithoutRegistry = new Transaction();
  assert.equal(
    appendLaunchpadRegistryInstruction({
      transaction: txWithoutRegistry,
      creator: treasury,
      tokenMint: dbcFeeWallet,
      curvePool: dbcConfig,
      name: "No Registry",
      symbol: "NOREG",
      metadataUri: "https://example.com/no-registry.json",
    }),
    null
  );
  assert.equal(txWithoutRegistry.instructions.length, 0);

  process.env.CHESHIRE_LAUNCHPAD_PROGRAM_ID = cheshireProgram.toBase58();
  const agentProfile = deriveCheshireAgentProfilePda(treasury, asset, cheshireProgram);
  const txWithRegistry = new Transaction();
  const registry = appendLaunchpadRegistryInstruction({
    transaction: txWithRegistry,
    creator: treasury,
    tokenMint: dbcFeeWallet,
    curvePool: dbcConfig,
    name: "Registry Agent Token",
    symbol: "RAT",
    metadataUri: "https://example.com/registry-agent-token.json",
    launchKind: LaunchKind.AgentToken,
    agentProfile,
  });
  assert.equal(txWithRegistry.instructions.length, 1);
  assert.equal(registry?.programId, cheshireProgram.toBase58());
  assert.equal(registry?.agentProfile, agentProfile.toBase58());
  assert.equal(registry?.launchKind, LaunchKind.AgentToken);

  assert.equal(getConfiguredClawdProtocolProgramId(), null);
  const txWithoutClawd = new Transaction();
  assert.equal(
    appendClawdAgentBindingInstruction({
      transaction: txWithoutClawd,
      baseMint: dbcFeeWallet,
      agentWallet: treasury,
      authority: treasury,
      character: { name: "No Clawd" },
    }),
    null
  );
  assert.equal(txWithoutClawd.instructions.length, 0);

  const constitutionHash = hashClawdConstitution("test constitution");
  const characterHash = hashClawdCharacter({ name: "Registry Agent Token", symbol: "RAT" });
  process.env.CLAWD_PROTOCOL_PROGRAM_ID = clawdProgram.toBase58();
  process.env.CLAWD_AGENT_CONSTITUTION_SHA256 = Buffer.from(constitutionHash).toString("hex");
  const [agentBinding] = deriveClawdAgentBindingPda(treasury, clawdProgram);
  const txWithClawd = new Transaction();
  const clawdBinding = appendClawdAgentBindingInstruction({
    transaction: txWithClawd,
    baseMint: dbcFeeWallet,
    agentWallet: treasury,
    authority: treasury,
    characterHash,
  });
  assert.equal(txWithClawd.instructions.length, 1);
  assert.equal(clawdBinding?.programId, clawdProgram.toBase58());
  assert.equal(clawdBinding?.agentBindingAddress, agentBinding.toBase58());
  assert.equal(clawdBinding?.constitutionHash, Buffer.from(constitutionHash).toString("hex"));

  const directClawdIx = buildClawdRegisterAgentBindingInstruction({
    baseMint: dbcFeeWallet,
    agentWallet: treasury,
    authority: treasury,
    characterHash,
    constitutionHash,
    capabilities: DEFAULT_CLAWD_AGENT_CAPABILITIES,
    programId: clawdProgram,
  });
  assert.equal(txWithClawd.instructions[0].programId.toBase58(), directClawdIx.programId.toBase58());
  assert.deepEqual(txWithClawd.instructions[0].data, directClawdIx.data);
  assert.deepEqual(
    txWithClawd.instructions[0].keys.map((key) => ({
      pubkey: key.pubkey.toBase58(),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })),
    directClawdIx.keys.map((key) => ({
      pubkey: key.pubkey.toBase58(),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    }))
  );

  const clawdSdkRoot = process.env.CLAWD_SDK_ROOT
    ? path.resolve(process.env.CLAWD_SDK_ROOT)
    : path.resolve(process.cwd(), "../solana-clawd/packages/clawd-sdk");
  const clawdSdkPath = path.join(clawdSdkRoot, "dist/index.js");
  if (existsSync(clawdSdkPath)) {
    const sdk = await import(pathToFileURL(clawdSdkPath).href);
    const sdkRequire = createRequire(path.join(clawdSdkRoot, "package.json"));
    const sdkWeb3 = sdkRequire("@solana/web3.js");
    const sdkTreasury = new sdkWeb3.PublicKey(treasury.toBase58());
    const sdkMint = new sdkWeb3.PublicKey(dbcFeeWallet.toBase58());

    const [sdkBinding] = sdk.deriveAgentBindingPda(sdkTreasury);
    assert.equal(sdkBinding.toBase58(), deriveClawdAgentBindingPda(treasury)[0].toBase58());
    assert.equal(
      Buffer.from(sdk.hashConstitution("test constitution")).toString("hex"),
      Buffer.from(constitutionHash).toString("hex")
    );
    assert.equal(
      Buffer.from(sdk.hashCharacter({ name: "Registry Agent Token", symbol: "RAT" })).toString("hex"),
      Buffer.from(characterHash).toString("hex")
    );

    const sdkIx = sdk.buildRegisterAgentBindingInstruction(
      sdkMint,
      sdkTreasury,
      sdkTreasury,
      characterHash,
      constitutionHash,
      DEFAULT_CLAWD_AGENT_CAPABILITIES
    ).instructions[0];
    assert.equal(sdkIx.programId.toBase58(), directClawdIx.programId.toBase58());
    assert.deepEqual(sdkIx.data, directClawdIx.data);
    assert.deepEqual(
      sdkIx.keys.map((key: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }) => ({
        pubkey: key.pubkey.toBase58(),
        isSigner: key.isSigner,
        isWritable: key.isWritable,
      })),
      directClawdIx.keys.map((key) => ({
        pubkey: key.pubkey.toBase58(),
        isSigner: key.isSigner,
        isWritable: key.isWritable,
      }))
    );
  }

  console.log("launchpad config smoke tests passed");
} finally {
  process.env = originalEnv;
}
