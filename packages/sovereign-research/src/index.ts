#!/usr/bin/env node
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { KnowledgeBase } from "./knowledge/loader.js";
import { ClawdRouterClient } from "./router/client.js";
import { ResearchOrchestrator } from "./research/orchestrator.js";
import { startTUI } from "./tui/index.js";
import type { LabsConfig } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const program = new Command();

program
  .name("sovereign")
  .description("OpenClawd sovereign research — knowledge-aware LLM routing, Solana agent intelligence")
  .version("0.1.0");

program
  .command("start", { isDefault: true })
  .description("Start the sovereign research TUI")
  .option(
    "-k, --knowledge <path>",
    "Path to knowledge directory",
    join(__dirname, "../../../../knowledge")
  )
  .option(
    "-r, --router <url>",
    "ClawdRouter base URL",
    process.env["CLAWDROUTER_URL"] ?? "http://localhost:8402"
  )
  .option("-m, --model <model>", "Default LLM model", process.env["CLAWD_MODEL"])
  .option("--birdeye <key>", "Birdeye API key", process.env["BIRDEYE_API_KEY"])
  .option("--helius <key>", "Helius API key", process.env["HELIUS_API_KEY"])
  .option(
    "--loop-interval <ms>",
    "Karpathy autoloop interval in ms",
    String(Number(process.env["CLAWD_LOOP_INTERVAL"] ?? 60_000))
  )
  .action(async (opts: {
    knowledge: string;
    router: string;
    model?: string;
    birdeye?: string;
    helius?: string;
    loopInterval: string;
  }) => {
    const config: LabsConfig = {
      knowledgePath: opts.knowledge,
      routerUrl: opts.router,
      routerModel: opts.model,
      birdeyeApiKey: opts.birdeye,
      heliusApiKey: opts.helius,
      autoloop: false,
      loopIntervalMs: parseInt(opts.loopInterval, 10),
    };

    const kb = new KnowledgeBase();
    kb.load(config.knowledgePath);

    const router = new ClawdRouterClient(config.routerUrl, config.routerModel ?? "auto");
    const orchestrator = new ResearchOrchestrator(config, kb, router);

    await startTUI(kb, router, orchestrator);
  });

program
  .command("research <query>")
  .description("Run a one-shot sovereign research query and print results")
  .option("-k, --knowledge <path>", "Path to knowledge directory", join(__dirname, "../../../../knowledge"))
  .option("-r, --router <url>", "ClawdRouter base URL", process.env["CLAWDROUTER_URL"] ?? "http://localhost:8402")
  .option("--birdeye <key>", "Birdeye API key", process.env["BIRDEYE_API_KEY"])
  .option("-f, --focus <focus>", "Research focus: chain|defi|market|knowledge", "chain")
  .action(async (query: string, opts: { knowledge: string; router: string; birdeye?: string; focus: string }) => {
    const config: LabsConfig = {
      knowledgePath: opts.knowledge,
      routerUrl: opts.router,
      birdeyeApiKey: opts.birdeye,
      autoloop: false,
      loopIntervalMs: 60_000,
    };

    const kb = new KnowledgeBase();
    kb.load(config.knowledgePath);

    const router = new ClawdRouterClient(config.routerUrl);
    const orchestrator = new ResearchOrchestrator(config, kb, router);

    console.log(`\nResearching: ${query}\n`);
    const result = await orchestrator.research(query, opts.focus as "chain" | "defi" | "market" | "knowledge");

    for (const finding of result.findings) {
      if (finding.source === "knowledge") {
        const hits = finding.data as Array<{ id: string; fact: string }>;
        console.log(`[knowledge] ${hits.length} relevant facts found`);
        for (const h of hits.slice(0, 3)) console.log(`  [${h.id}] ${h.fact}`);
      } else if (finding.source === "birdeye") {
        console.log(`[birdeye] Live chain data fetched`);
      } else if (finding.source === "router") {
        const d = finding.data as Record<string, unknown>;
        if (typeof d.answer === "string") {
          console.log(`\n[analysis]\n${d.answer}\n`);
        } else if (d.error) {
          console.log(`[router error] ${d.error}`);
        }
      }
    }
    process.exit(0);
  });

program
  .command("knowledge <query>")
  .description("Search the knowledge base")
  .option("-k, --knowledge <path>", "Path to knowledge directory", join(__dirname, "../../../../knowledge"))
  .option("-n, --limit <n>", "Max results", "10")
  .action((query: string, opts: { knowledge: string; limit: string }) => {
    const kb = new KnowledgeBase();
    kb.load(opts.knowledge);
    const hits = kb.search(query, parseInt(opts.limit, 10));
    if (hits.length === 0) {
      console.log("No entries found.");
      process.exit(0);
    }
    for (const h of hits) {
      console.log(`[${h.id}][${h.type}][${h.confidence}]`);
      console.log(`  ${h.fact}`);
      console.log(`  → ${h.recommendation}`);
      console.log(`  tags: ${h.tags.join(", ")}\n`);
    }
    process.exit(0);
  });

program.parse(process.argv);
