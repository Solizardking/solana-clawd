import { execSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CAPABILITY_LOCATIONS } from "../auth/capabilities.js";
import { printInfo, printOk, printSection, printWarn } from "../banner.js";

const X402_API_BASE = process.env.X402_API_URL ?? "https://x402.wtf/api";
const AGENTS_URL = `${X402_API_BASE.replace(/\/$/, "")}/agents`;
const ATTEST_URL = `${X402_API_BASE.replace(/\/$/, "")}/agents/attest`;

export interface RegisterOptions {
  /** Agent display name */
  name: string;
  /** System role / prompt */
  systemRole?: string;
  /** Short description */
  description?: string;
  /** Comma-separated tags */
  tags?: string;
  /** Emoji or URL avatar */
  avatar?: string;
  /** Category: trading | defi | research | infrastructure | agentic */
  category?: string;
  /** Comma-separated skill names */
  skills?: string;
  /** Author name */
  author?: string;
  /** Homepage URL */
  homepage?: string;
  /** Only write locally — skip the x402.wtf API call */
  local?: boolean;
  /** Bearer token for x402.wtf/api (reads X402_API_KEY env if not provided) */
  apiKey?: string;
  /** Preview without writing anything */
  dryRun?: boolean;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function getCatalogSrcDir(): string {
  const thisFile = fileURLToPath(import.meta.url);
  return join(dirname(thisFile), "../../..", "src");
}

function getBuildScript(): string {
  const thisFile = fileURLToPath(import.meta.url);
  return join(dirname(thisFile), "../../..", "build-catalog.cjs");
}

function buildAgentJson(id: string, opts: RegisterOptions): Record<string, unknown> {
  const tags = opts.tags
    ? opts.tags.split(",").map((t) => t.trim()).filter(Boolean)
    : ["solana", "clawd"];

  const skills = opts.skills
    ? opts.skills.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  return {
    author: opts.author ?? "x402agent",
    config: {
      systemRole: opts.systemRole ?? `You are ${opts.name}. ${opts.description ?? ""}`.trim(),
    },
    createdAt: new Date().toISOString().slice(0, 10),
    homepage: opts.homepage ?? "https://github.com/x402agent/LobsterLibrary",
    identifier: id,
    knowledgeCount: 0,
    meta: {
      avatar: opts.avatar ?? "🤖",
      description: opts.description ?? opts.name,
      tags,
      title: opts.name,
      category: opts.category ?? "agentic",
    },
    pluginCount: 0,
    schemaVersion: 1,
    tokenUsage: 0,
    ...(skills.length > 0 ? { skills } : {}),
    agentAuth: {
      protocol: "CAAP/1.0",
      discovery: "https://x402.wtf/.well-known/agent-auth.json",
      registrationEndpoint: "https://x402.wtf/api/auth/agent/register",
      modes: ["delegated", "autonomous"],
      keyAlgorithms: ["Ed25519"],
    },
  };
}

async function postToApi(
  url: string,
  body: unknown,
  apiKey: string | undefined,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = await res.text().catch(() => "(no body)");
  }

  return { ok: res.ok, status: res.status, data };
}

export async function runRegister(opts: RegisterOptions): Promise<void> {
  if (!opts.name) throw new Error("--name is required");

  const id = slugify(opts.name);
  const agentJson = buildAgentJson(id, opts);
  const apiKey = opts.apiKey ?? process.env.X402_API_KEY;

  printSection(`One-shot Agent Registration: ${opts.name}`);
  console.error(`\n  Identifier: ${id}`);
  console.error(`  Category:   ${agentJson.meta ? (agentJson.meta as Record<string,unknown>).category : "agentic"}`);
  console.error(`  Tags:       ${(agentJson.meta as Record<string,unknown>).tags}`);

  if (opts.dryRun) {
    printInfo("Dry run — agent JSON preview:");
    console.log(JSON.stringify(agentJson, null, 2));
    return;
  }

  // ── Step 1: write to local catalog ─────────────────────────────────────────
  const catalogSrc = getCatalogSrcDir();
  const destPath = join(catalogSrc, `${id}.json`);

  if (existsSync(catalogSrc)) {
    if (existsSync(destPath)) {
      printWarn(`${destPath} already exists — overwriting`);
    }
    writeFileSync(destPath, `${JSON.stringify(agentJson, null, 2)}\n`, "utf-8");
    printOk(`Written → ${destPath}`);
  } else {
    printWarn(`Catalog src not found at ${catalogSrc} — skipping local write`);
  }

  // ── Step 2: rebuild local catalog ──────────────────────────────────────────
  const buildScript = getBuildScript();
  if (existsSync(buildScript)) {
    try {
      execSync(`node "${buildScript}"`, {
        stdio: "pipe",
        cwd: dirname(buildScript),
      });
      printOk("Local catalog rebuilt");
    } catch (err) {
      printWarn(`Catalog rebuild failed: ${String(err)}`);
    }
  }

  // ── Step 3: POST to x402.wtf/api/agents (unless --local) ───────────────────
  if (!opts.local) {
    if (!apiKey) {
      printWarn("No X402_API_KEY — skipping remote registration (use --local or set X402_API_KEY)");
    } else {
      printInfo(`Registering at ${AGENTS_URL} ...`);
      const reg = await postToApi(AGENTS_URL, agentJson, apiKey);
      if (reg.ok) {
        printOk(`Registered at ${AGENTS_URL}`);
      } else {
        printWarn(`Registration returned ${reg.status}: ${JSON.stringify(reg.data)}`);
      }

      // ── Step 4: attest via CAAP/1.0 ──────────────────────────────────────
      printInfo(`Attesting at ${ATTEST_URL} ...`);
      const attestPayload = {
        agentId: id,
        protocol: "CAAP/1.0",
        capabilities: Object.values(CAPABILITY_LOCATIONS),
        registeredAt: new Date().toISOString(),
      };
      const att = await postToApi(ATTEST_URL, attestPayload, apiKey);
      if (att.ok) {
        printOk("Agent attested (CAAP/1.0)");
      } else {
        printWarn(`Attestation returned ${att.status}: ${JSON.stringify(att.data)}`);
      }
    }
  }

  // ── Done ────────────────────────────────────────────────────────────────────
  console.error(`
  ✅ Registration complete
     Identifier: ${id}
     Local:      ${destPath}
     Catalog:    ${AGENTS_URL}/catalog
     Direct:     ${AGENTS_URL}/${id}
     Attest:     ${ATTEST_URL}
  `);
}
