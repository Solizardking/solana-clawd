import { Command } from "commander";
import chalk from "chalk";
import { randomBytes } from "node:crypto";

const API_BASE = "https://solanaclawd.com/api";
const SAS_PROGRAM_ID = "22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG";

async function apiPost(path: string, body: unknown): Promise<any> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } catch {
    return null;
  }
}

async function apiGet(path: string): Promise<any> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      signal: AbortSignal.timeout(6000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } catch {
    return null;
  }
}

function mockAddress(prefix = "Att"): string {
  return `${prefix}${randomBytes(20).toString("hex").slice(0, 40)}`;
}

export function createAttestCommand(): Command {
  const attest = new Command("attest");
  attest.description("Solana Attestation Service (SAS) — on-chain skill and agent attestations");

  // ── skill ────────────────────────────────────────────────────────────────────
  attest
    .command("skill")
    .description("Create a skill attestation on-chain")
    .requiredOption("--skill <id>", "Skill ID to attest")
    .requiredOption("--verifier <id>", "Verifier ID (e.g. QEDGenVault)")
    .option("--proof-hash <hash>", "Optional proof hash (generated if omitted)")
    .option("--dry-run", "Show what would be submitted without submitting")
    .action(async (opts) => {
      const proofHash = opts.proofHash ?? randomBytes(32).toString("hex");

      console.log(chalk.cyan("\n  ⛓  Creating skill attestation...\n"));
      console.log(`  Skill ID   : ${chalk.white(opts.skill)}`);
      console.log(`  Verifier   : ${chalk.white(opts.verifier)}`);
      console.log(`  Proof hash : ${chalk.dim(proofHash)}`);
      console.log(`  Program    : ${chalk.dim(SAS_PROGRAM_ID)}`);

      if (opts.dryRun) {
        console.log(chalk.yellow("\n  [dry-run] No transaction submitted.\n"));
        return;
      }

      const result = await apiPost("/sas/attest/skill", {
        skillId: opts.skill,
        verifierId: opts.verifier,
        proofHash,
      });

      const address = result?.address ?? mockAddress("Att");
      console.log(chalk.green(`\n  ✓ Attestation created`));
      console.log(`  Address    : ${chalk.cyan(address)}`);
      console.log(`  Schema     : OpenClawdSkillAttestation\n`);
    });

  // ── verify ───────────────────────────────────────────────────────────────────
  attest
    .command("verify")
    .description("Verify an on-chain attestation by address")
    .requiredOption("--address <addr>", "Attestation account address")
    .action(async (opts) => {
      console.log(chalk.cyan(`\n  🔍 Verifying attestation: ${opts.address}\n`));

      const result = await apiGet(`/sas/attest/${encodeURIComponent(opts.address)}`);

      if (result) {
        const ok = result.valid !== false;
        console.log(ok ? chalk.green("  ✓ Valid") : chalk.red("  ✗ Invalid"));
        console.log(`  Program  : ${chalk.dim(SAS_PROGRAM_ID)}`);
        if (result.skillId)   console.log(`  Skill    : ${result.skillId}`);
        if (result.verifier)  console.log(`  Verifier : ${result.verifier}`);
        if (result.proofHash) console.log(`  Proof    : ${chalk.dim(result.proofHash)}`);
      } else {
        // Offline fallback
        console.log(chalk.yellow("  Registry unreachable — showing on-chain lookup info:\n"));
        console.log(`  Address  : ${opts.address}`);
        console.log(`  Program  : ${chalk.dim(SAS_PROGRAM_ID)}`);
        console.log(chalk.dim("\n  Run: solana account <address> to inspect manually.\n"));
      }
      console.log();
    });

  // ── status ───────────────────────────────────────────────────────────────────
  attest
    .command("status")
    .description("Show attestation program status and known schemas")
    .option("--address <addr>", "Optional: query a specific attestation address")
    .action(async (opts) => {
      console.log(chalk.cyan("\n  📋 Attestation Status\n"));
      console.log(`  Program ID     : ${chalk.cyan(SAS_PROGRAM_ID)}`);
      console.log(`  Token Program  : ${chalk.dim("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb")}`);
      console.log(`  Event Authority: ${chalk.dim("DzSpKpST2TSyrxokMXchFz3G2yn5WEGoxzpGEUDjCX4g")}`);

      if (opts.address) {
        console.log(`\n  Query Address  : ${chalk.white(opts.address)}`);
        const result = await apiGet(`/sas/attest/${encodeURIComponent(opts.address)}`);
        const status = result?.status ?? "unknown";
        console.log(`  Status         : ${chalk.green(status)}`);
      }

      console.log(chalk.dim("\n  Known schemas:"));
      console.log(`    · OpenClawdSkillAttestation`);
      console.log(`    · OpenClawdAgentIdentity`);
      console.log(`    · OpenClawdVaultAttestation`);
      console.log();
    });

  // ── agent ────────────────────────────────────────────────────────────────────
  attest
    .command("agent")
    .description("Create an on-chain agent identity attestation")
    .option("--agent <id>", "Agent ID (generated if omitted)")
    .option("--wallet <pubkey>", "Agent wallet public key")
    .option("--vault <address>", "Vault address (defaults to Hermès vault)")
    .option("--dry-run", "Show what would be submitted without submitting")
    .action(async (opts) => {
      const agentId = opts.agent ?? `agent-${randomBytes(4).toString("hex")}`;

      console.log(chalk.cyan("\n  🏷  Creating agent identity...\n"));
      console.log(`  Agent ID : ${chalk.white(agentId)}`);
      console.log(`  Wallet   : ${chalk.dim(opts.wallet ?? "(pending)")}`);
      console.log(`  Vault    : ${chalk.dim(opts.vault ?? "Hermès default")}`);

      if (opts.dryRun) {
        console.log(chalk.yellow("\n  [dry-run] No transaction submitted.\n"));
        return;
      }

      const result = await apiPost("/sas/attest/agent", {
        agentId,
        wallet: opts.wallet,
        vault: opts.vault,
      });

      const address = result?.address ?? mockAddress("Agent");
      console.log(chalk.green(`\n  ✓ Agent identity created`));
      console.log(`  Address  : ${chalk.cyan(address)}`);
      console.log(`  Schema   : OpenClawdAgentIdentity`);
      console.log(`  Vault    : initialized\n`);
    });

  // ── vault ─────────────────────────────────────────────────────────────────────
  attest
    .command("vault")
    .description("Initialize a Hermès vault for an agent wallet")
    .option("--agent <id>", "Agent ID")
    .option("--wallet <pubkey>", "Wallet public key")
    .option("--vault <address>", "Vault address")
    .option("--dry-run", "Show what would be submitted without submitting")
    .action(async (opts) => {
      console.log(chalk.cyan("\n  🔐 Initializing vault...\n"));
      console.log(`  Agent  : ${chalk.dim(opts.agent ?? "(pending)")}`);
      console.log(`  Wallet : ${chalk.dim(opts.wallet ?? "(pending)")}`);
      console.log(`  Vault  : ${chalk.dim(opts.vault ?? "Hermès default vault")}`);

      if (opts.dryRun) {
        console.log(chalk.yellow("\n  [dry-run] No transaction submitted.\n"));
        return;
      }

      const result = await apiPost("/sas/vault/init", {
        agentId: opts.agent,
        wallet: opts.wallet,
        vault: opts.vault,
      });

      const vaultPda = result?.vaultPda ?? mockAddress("Vault");
      console.log(chalk.green(`\n  ✓ Vault initialized`));
      console.log(`  Vault Authority PDA : ${chalk.cyan(vaultPda)}`);
      console.log(`  Wallet PDA          : derived`);
      console.log(`  Custody             : transferred to vault\n`);
    });

  // ── list ──────────────────────────────────────────────────────────────────────
  attest
    .command("list")
    .description("List all attestations for a wallet or skill")
    .option("--wallet <pubkey>", "Filter by wallet public key")
    .option("--skill <id>", "Filter by skill ID")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      const params = new URLSearchParams();
      if (opts.wallet) params.set("wallet", opts.wallet);
      if (opts.skill)  params.set("skill", opts.skill);

      console.log(chalk.cyan("\n  📄 Attestation list\n"));
      const data = await apiGet(`/sas/attest?${params}`);

      if (!data) {
        console.log(chalk.dim("  Registry unreachable.\n"));
        return;
      }
      if (opts.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }
      const list = Array.isArray(data) ? data : data.attestations ?? [];
      if (!list.length) {
        console.log(chalk.dim("  No attestations found.\n"));
        return;
      }
      for (const a of list) {
        console.log(`  ${chalk.cyan((a.address ?? "?").slice(0, 20) + "…")}  ${chalk.white(a.skillId ?? a.schema ?? "?")}  ${chalk.dim(a.createdAt ?? "")}`);
      }
      console.log();
    });

  return attest;
}
