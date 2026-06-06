/**
 * agents/cli/src/commands/identity.ts
 *
 * Clawd Agent On-Chain Identity — the professional identity attestation command
 * modeled after Google ADK's agent identity workflow.
 *
 * Commands:
 *   clawd-agents identity create       — Create a new on-chain agent identity
 *   clawd-agents identity attest       — Attest an existing identity via SAS
 *   clawd-agents identity verify       — Verify on-chain attestation status
 *   clawd-agents identity spiffe       — Show Google SPIFFE principal mapping
 *   clawd-agents identity bridge-google — Bridge identity to Google Agent Registry
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { printSection, printOk, printInfo, printWarn, printDone } from "../banner.js";

// ─── Constants ──────────────────────────────────────────────────────────────

const OPENCLAWD_DIR = join(homedir(), ".openclawd");
const IDENTITY_FILE = join(OPENCLAWD_DIR, "agent-identity.json");

const SAS_PROGRAM_ID = "22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG";
const MPL_CORE_PROGRAM_ID = "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d";
const CLAWD_TOKEN_MINT = "CLAWdRg8ZbE7eAhZ8PJKJqBuDnTHruxvV7r5QGSPump";
const DNA_X402_RECEIPT = "6HSRGivdYR5D7yTDy1TFMCM8h3LzXxRtKU1RA3RnCMRN";

const PAY_BASE_URL = process.env.PAY_BASE_URL ?? "https://x402.wtf";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AgentIdentity {
  agentId: string;
  createdAt: string;
  wallet: {
    pubkey: string;
    file: string;
  };
  attestation: {
    sasProgramId: string;
    identityPDA: string;
    status: "pending" | "attested" | "verified";
    txSignature?: string;
  };
  metaplex: {
    coreProgramId: string;
    nftMintAddress: string;
    metadataUri: string;
  };
  google?: {
    projectId: string;
    projectNumber: string;
    location: string;
    engineId: string;
    spiffePrincipal: string;
    resourceName: string;
    iamRoles: string[];
  };
  x402: {
    attestEndpoint: string;
    paymentAttestationPDA?: string;
    receiptHash?: string;
  };
  clawd: {
    tokenMint: string;
    governed: boolean;
    balance?: number;
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadIdentity(): AgentIdentity | null {
  if (!existsSync(IDENTITY_FILE)) return null;
  try {
    return JSON.parse(readFileSync(IDENTITY_FILE, "utf-8")) as AgentIdentity;
  } catch {
    return null;
  }
}

function saveIdentity(identity: AgentIdentity): void {
  const { mkdirSync } = require("node:fs");
  mkdirSync(OPENCLAWD_DIR, { recursive: true });
  writeFileSync(IDENTITY_FILE, JSON.stringify(identity, null, 2) + "\n");
  printOk(`Identity saved: ${IDENTITY_FILE}`);
}

function hasSolana(): boolean {
  try {
    execSync("solana --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function hasNode(): boolean {
  try {
    execSync("node --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// ─── Command: identity create ───────────────────────────────────────────────

export async function runIdentityCreate(opts: {
  agentId?: string;
  googleProject?: string;
  googleLocation?: string;
  vault?: boolean;
  dryRun?: boolean;
}): Promise<void> {
  printSection("On-Chain Agent Identity — Create");

  const agentId = opts.agentId ?? `clawd-agent-${Date.now().toString(36)}`;

  // Step 1: Generate Solana wallet
  printInfo("Step 1/5: Solana wallet");
  let pubkey = "";
  let walletFile = join(OPENCLAWD_DIR, `${agentId}-wallet.json`);

  if (hasSolana()) {
    execSync(`solana-keygen new --no-bip39-passphrase --force --outfile "${walletFile}"`, {
      stdio: "pipe",
    });
    pubkey = execSync(`solana-keygen pubkey "${walletFile}"`, { encoding: "utf-8" }).trim();
  } else if (hasNode()) {
    const script = `
      const { Keypair } = require('@solana/web3.js');
      const bs58 = require('bs58');
      const kp = Keypair.generate();
      const wallet = { pubkey: kp.publicKey.toBase58(), secretKey: bs58.encode(kp.secretKey) };
      require('fs').writeFileSync("${walletFile}", JSON.stringify(wallet, null, 2));
      console.log(wallet.pubkey);
    `;
    pubkey = execSync(`node -e "${script.replace(/"/g, '\\"')}"`, { encoding: "utf-8" }).trim();
  } else {
    throw new Error("Neither solana CLI nor Node.js found — install one to generate a wallet.");
  }

  printOk(`Wallet: ${pubkey}`);
  printInfo(`File:   ${walletFile}`);

  // Step 2: Derive MPL Core NFT address
  printInfo("Step 2/5: MPL Core NFT derivation");
  let nftMint = "offline";
  if (hasNode()) {
    const script = `
      const { PublicKey } = require('@solana/web3.js');
      const MPL = new PublicKey("${MPL_CORE_PROGRAM_ID}");
      const wallet = new PublicKey("${pubkey}");
      const agentId = "${agentId}".slice(0, 32);
      const [mint] = PublicKey.findProgramAddressSync([
        Buffer.from("agent_identity"),
        Buffer.from(agentId),
        wallet.toBuffer()
      ], MPL);
      console.log(mint.toBase58());
    `;
    try {
      nftMint = execSync(`node -e "${script.replace(/"/g, '\\"')}"`, { encoding: "utf-8" }).trim();
    } catch { /* keep offline */ }
  }
  printOk(`MPL Core NFT: ${nftMint}`);

  // Step 3: Derive SAS identity PDA
  printInfo("Step 3/5: SAS Attestation PDA");
  let sasPda = "offline";
  if (hasNode()) {
    const script = `
      const { PublicKey } = require('@solana/web3.js');
      const SAS = new PublicKey("${SAS_PROGRAM_ID}");
      const wallet = new PublicKey("${pubkey}");
      const [pda] = PublicKey.findProgramAddressSync([
        wallet.toBuffer(),
        Buffer.from("agent_identity")
      ], SAS);
      console.log(pda.toBase58());
    `;
    try {
      sasPda = execSync(`node -e "${script.replace(/"/g, '\\"')}"`, { encoding: "utf-8" }).trim();
    } catch { /* keep offline */ }
  }
  printOk(`SAS Identity PDA: ${sasPda}`);

  // Step 4: x402 payment attestation
  printInfo("Step 4/5: x402 Payment Attestation");
  printInfo(`Endpoint: ${PAY_BASE_URL}/v1/attest/payment`);

  // Step 5: Build identity record
  printInfo("Step 5/5: Identity record");

  const identity: AgentIdentity = {
    agentId,
    createdAt: new Date().toISOString(),
    wallet: { pubkey, file: walletFile },
    attestation: {
      sasProgramId: SAS_PROGRAM_ID,
      identityPDA: sasPda,
      status: "pending",
    },
    metaplex: {
      coreProgramId: MPL_CORE_PROGRAM_ID,
      nftMintAddress: nftMint,
      metadataUri: `https://x402.wtf/agents/${agentId}/metadata.json`,
    },
    x402: {
      attestEndpoint: `${PAY_BASE_URL}/v1/attest/payment`,
    },
    clawd: {
      tokenMint: CLAWD_TOKEN_MINT,
      governed: true,
    },
  };

  // Google SPIFFE bridge
  if (opts.googleProject) {
    const projectNumber = opts.googleProject; // passed as project number
    const location = opts.googleLocation ?? "global";
    const engineId = "ENGINE_ID"; // placeholder — actual value from deployment

    identity.google = {
      projectId: projectNumber,
      projectNumber,
      location,
      engineId,
      spiffePrincipal: `principal://agents.global.org-ORG_ID.system.id.goog/resources/aiplatform/projects/${projectNumber}/locations/${location}/reasoningEngines/${engineId}`,
      resourceName: `projects/${projectNumber}/locations/${location}/agents/${agentId}`,
      iamRoles: [
        "roles/agentregistry.viewer",
        "roles/agentregistry.editor",
        "roles/mcp.toolUser",
        "roles/aiplatform.agentContextEditor",
        "roles/aiplatform.user",
      ],
    };
    printOk("Google SPIFFE principal resolved");
  }

  if (!opts.dryRun) {
    saveIdentity(identity);
  } else {
    printInfo("Dry run — identity not saved");
  }

  // Summary
  printSection("Identity Card");
  console.error(`\n  Agent ID:      ${identity.agentId}`);
  console.error(`  Wallet Pubkey: ${identity.wallet.pubkey}`);
  console.error(`  MPL Core NFT:  ${identity.metaplex.nftMintAddress}`);
  console.error(`  SAS PDA:       ${identity.attestation.identityPDA}`);
  console.error(`  Status:        ${identity.attestation.status}`);
  console.error(`  Clawd Token:   ${identity.clawd.tokenMint.slice(0, 12)}...${identity.clawd.tokenMint.slice(-4)}`);
  if (identity.google) {
    console.error(`\n  Google SPIFFE: ${identity.google.spiffePrincipal}`);
    console.error(`  Resource Name: ${identity.google.resourceName}`);
  }
  console.error(`\n  On-chain attestation: ${identity.metaplex.coreProgramId}`);
  console.error(`  x402 receipt anchor:  ${DNA_X402_RECEIPT}`);
  console.error(`  dna-x402: ${DNA_X402_RECEIPT} — auditable evidence for ARS/Telaro slash claims`);

  printDone("Next: clawd-agents identity attest to complete on-chain attestation");
}

// ─── Command: identity attest ───────────────────────────────────────────────

export async function runIdentityAttest(opts: { dryRun?: boolean }): Promise<void> {
  printSection("On-Chain Agent Identity — Attest");

  const identity = loadIdentity();
  if (!identity) {
    throw new Error(
      "No identity found. Run `clawd-agents identity create` first.\n" +
      `Identity file: ${IDENTITY_FILE}`,
    );
  }

  printInfo(`Agent:  ${identity.agentId}`);
  printInfo(`Wallet: ${identity.wallet.pubkey}`);

  // Check on-chain status via Solana RPC
  let onChain = false;
  const rpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAccountInfo",
        params: [identity.attestation.identityPDA, { encoding: "base64" }],
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      const data = (await response.json()) as { result?: { value?: unknown } };
      if (data.result?.value) {
        onChain = true;
        printOk("Identity found on-chain ✓");
      } else {
        printInfo("Identity not yet on-chain — needs wallet signature");
      }
    }
  } catch {
    printWarn("Cannot reach Solana RPC — check SOLANA_RPC_URL");
  }

  if (onChain) {
    identity.attestation.status = "verified";
  } else {
    printInfo("\n  To complete on-chain attestation:");
    printInfo("  1. Fund wallet with SOL for transaction fees");
    printInfo(`  2. Build attestation tx via: ${PAY_BASE_URL}/v1/attest/payment`);
    printInfo("  3. Sign + submit via: clawd-agents sign <BASE64_TX>");
    printInfo("  4. Then run: clawd-agents identity verify");
  }

  if (!opts.dryRun && onChain) {
    saveIdentity(identity);
  }

  printDone(onChain ? "Identity verified on-chain" : "Identity ready for signature");
}

// ─── Command: identity verify ───────────────────────────────────────────────

export async function runIdentityVerify(): Promise<void> {
  printSection("On-Chain Agent Identity — Verify");

  const identity = loadIdentity();
  if (!identity) {
    throw new Error(`No identity found. Run \`clawd-agents identity create\` first.`);
  }

  const rpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

  // Check SAS attestation
  let sasOk = false;
  let mplOk = false;

  try {
    const sasRes = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "getAccountInfo",
        params: [identity.attestation.identityPDA, { encoding: "base64" }],
      }),
    });
    const sasData = (await sasRes.json()) as { result?: { value?: unknown } };
    sasOk = Boolean(sasData.result?.value);
  } catch { /* RPC unreachable */ }

  try {
    const mplRes = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 2, method: "getAccountInfo",
        params: [identity.metaplex.nftMintAddress, { encoding: "base64" }],
      }),
    });
    const mplData = (await mplRes.json()) as { result?: { value?: unknown } };
    mplOk = Boolean(mplData.result?.value);
  } catch { /* RPC unreachable */ }

  printSection("Verification Results");
  console.error(`\n  Agent ID:       ${identity.agentId}`);
  console.error(`  Wallet Pubkey:  ${identity.wallet.pubkey}`);
  console.error(`\n  SAS Attestation: ${sasOk ? "✓ VERIFIED" : "✗ NOT FOUND"}`);
  console.error(`    PDA:           ${identity.attestation.identityPDA}`);
  console.error(`    Program:       ${identity.attestation.sasProgramId}`);
  console.error(`\n  MPL Core NFT:   ${mplOk ? "✓ VERIFIED" : "✗ NOT FOUND"}`);
  console.error(`    Mint:          ${identity.metaplex.nftMintAddress}`);
  console.error(`    Program:       ${identity.metaplex.coreProgramId}`);
  console.error(`\n  x402 Proof:     ${identity.attestation.status === "verified" ? "✓ ATTESTED" : "○ PENDING"}`);

  if (identity.google) {
    console.error(`\n  Google SPIFFE:  ${identity.google.spiffePrincipal}`);
    console.error(`  Resource:       ${identity.google.resourceName}`);
  }

  printDone(sasOk ? "Identity verified on-chain" : "Identity not yet on-chain");
}

// ─── Command: identity spiffe ───────────────────────────────────────────────

export function runIdentitySpiffe(opts: {
  organizationId?: string;
  projectNumber?: string;
  location?: string;
  engineId?: string;
}): void {
  printSection("Google SPIFFE Agent Identity Mapping");

  const orgId = opts.organizationId ?? "ORG_ID";
  const projectNum = opts.projectNumber ?? "PROJECT_NUMBER";
  const location = opts.location ?? "us-central1";
  const engineId = opts.engineId ?? "ENGINE_ID";

  const singleAgent = `principal://agents.global.org-${orgId}.system.id.goog/resources/aiplatform/projects/${projectNum}/locations/${location}/reasoningEngines/${engineId}`;
  const projectWide = `principalSet://agents.global.org-${orgId}.system.id.goog/attribute.platformContainer/aiplatform/projects/${projectNum}`;
  const orgWide = `principalSet://agents.global.org-${orgId}.system.id.goog/*`;

  console.error(`\n  SPIFFE Principal Formats:
  
  Single agent:
    ${singleAgent}

  All agents in project:
    ${projectWide}

  All agents in organization:
    ${orgWide}
  `);

  console.error(`  Grant IAM roles (example):\n`);
  console.error(`    gcloud projects add-iam-policy-binding ${projectNum} \\`);
  console.error(`        --member="${singleAgent}" \\`);
  console.error(`        --role="roles/aiplatform.user"\n`);

  console.error(`  Register agent in Google Agent Registry:\n`);
  console.error(`    gcloud alpha agent-registry agents create ${engineId} \\`);
  console.error(`        --project=${projectNum} \\`);
  console.error(`        --location=${location} \\`);
  console.error(`        --display-name="Solana Clawd Agent" \\`);
  console.error(`        --description="On-chain attested agent with MPL Core + SAS + x402"\n`);

  console.error(`  Use in ADK Python:\n`);
  console.error(`    from google.adk.integrations.agent_registry import AgentRegistry`);
  console.error(`    registry = AgentRegistry(project_id="${projectNum}", location="${location}")`);
  console.error(`    agent = registry.get_remote_a2a_agent(agent_name="agents/${engineId}")\n`);

  console.error(`  Bridge to Solana on-chain identity:\n`);
  console.error(`    clawd-agents identity bridge-google --project ${projectNum} --agent ${engineId}\n`);

  printDone("SPIFFE principal shown. Use clawd-agents identity bridge-google to link to Solana.");
}

// ─── Command: identity bridge-google ────────────────────────────────────────

export async function runIdentityBridgeGoogle(opts: {
  projectId?: string;
  location?: string;
  agentId?: string;
  dryRun?: boolean;
}): Promise<void> {
  printSection("Bridge Google Agent Identity → Solana On-Chain Attestation");

  const identity = loadIdentity();
  if (!identity) {
    throw new Error("No identity found. Run `clawd-agents identity create` first.");
  }

  const projectId = opts.projectId ?? process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    throw new Error(
      "Google project ID required. Set GOOGLE_CLOUD_PROJECT or pass --project <id>.",
    );
  }

  const location = opts.location ?? "global";
  const agentId = opts.agentId ?? identity.agentId;

  // Call Pay bridge endpoint
  const payload = {
    googleProjectId: projectId,
    googleLocation: location,
    agentId,
    agentWalletPubkey: identity.wallet.pubkey,
    metaplexMetadataUri: `https://x402.wtf/agents/${agentId}/metadata.json`,
  };

  printInfo(`Calling: ${PAY_BASE_URL}/v1/agent-identity/google`);

  let bridgeResult: Record<string, unknown> | null = null;
  try {
    const res = await fetch(`${PAY_BASE_URL}/v1/agent-identity/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      bridgeResult = (await res.json()) as Record<string, unknown>;
    } else {
      printWarn(`Pay returned HTTP ${res.status} — ${await res.text().catch(() => "unknown")}`);
    }
  } catch {
    printWarn(`Pay gateway unreachable at ${PAY_BASE_URL}`);
  }

  if (bridgeResult && bridgeResult.success) {
    const ident = bridgeResult.identity as Record<string, unknown> | undefined;
    printOk("Google Agent Identity bridge created");
    if (ident?.googleResourceName) {
      console.error(`\n  Resource: ${ident.googleResourceName}`);
    }
    if (ident?.metaplex && typeof ident.metaplex === "object") {
      const m = ident.metaplex as Record<string, unknown>;
      console.error(`  MPL Core NFT: ${m.nftMintAddress ?? "derived"}`);
    }
    console.error(`\n  Required IAM roles:`);
    const roles = ident?.google && typeof ident.google === "object"
      ? (ident.google as Record<string, unknown>).requiredRoles as string[]
      : [];
    for (const role of roles) {
      console.error(`    - ${role}`);
    }
  }

  // Generate ADK integration code
  console.error(`\n  ─── ADK Python Integration ───\n`);
  console.error(`  from google.adk.integrations.agent_registry import AgentRegistry`);
  console.error(`  from google.adk.auth.credential_manager import CredentialManager`);
  console.error(`  from google.adk.integrations.agent_identity import GcpAuthProvider`);
  console.error(`\n`);
  console.error(`  CredentialManager.register_auth_provider(GcpAuthProvider())`);
  console.error(`  registry = AgentRegistry(project_id="${projectId}", location="${location}")`);
  console.error(`  agent = registry.get_remote_a2a_agent(agent_name="agents/${agentId}")`);
  console.error(`\n`);
  console.error(`  # Solana attestation MCP toolset`);
  console.error(`  solana_toolset = registry.get_mcp_toolset(`);
  console.error(`      mcp_server_name="mcpServers/solana-attestation"`);
  console.error(`  )`);

  printDone("Google identity bridge ready");
}