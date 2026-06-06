import * as readline from "node:readline";
import type { KnowledgeBase } from "../knowledge/loader.js";
import type { ClawdRouterClient } from "../router/client.js";
import type { ResearchOrchestrator } from "../research/orchestrator.js";

const BANNER = `
  ╔══════════════════════════════════════════════════════════╗
  ║   🦞  S O V E R E I G N   R E S E A R C H               ║
  ║   knowledge routing · Karpathy loop · Solana intel       ║
  ║   x402.wtf · clawdrouter.fly.dev                        ║
  ╚══════════════════════════════════════════════════════════╝
`;

const HELP = `
Commands:
  /knowledge <query>      Search knowledge base
  /research <query>       Run sovereign research (Birdeye + ClawdRouter)
  /autoloop start         Start Karpathy research loop
  /autoloop stop          Stop research loop
  /trending               Show trending Solana tokens
  /kb stats               Knowledge base statistics
  /model <id>             Switch ClawdRouter model (e.g. claude-3-5-sonnet)
  /help                   Show this help
  exit / quit             Exit
`;

export async function startTUI(
  kb: KnowledgeBase,
  router: ClawdRouterClient,
  orchestrator: ResearchOrchestrator
): Promise<void> {
  console.log(BANNER);
  console.log(`  Knowledge base loaded: ${kb.count()} entries`);

  const routerHealthy = await router.healthCheck();
  if (routerHealthy) {
    console.log("  ClawdRouter: connected (localhost:8402)");
  } else {
    console.log("  ClawdRouter: not detected — start with 'cd clawdrouter && npm run dev'");
    console.log("  (will use fallback remote routing)");
  }
  console.log("\n  Type /help for commands or start chatting.\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "🦞 > ",
    terminal: true,
  });

  const history: Array<{ role: "user" | "assistant"; content: string }> = [];
  let currentModel: string | undefined;

  // Autoloop default queries — the sovereign research mandate
  const defaultQueries = [
    "trending Solana tokens with high volume",
    "new meme token listings on pump.fun",
    "whale wallet movements on Solana",
    "DeFi yield opportunities Raydium Orca",
  ];

  orchestrator.startAutoloop(defaultQueries, (result, tick) => {
    const answer = result.findings.find((f) => f.source === "router");
    if (answer && typeof (answer.data as Record<string, unknown>).answer === "string") {
      process.stdout.write(`\n  [autoloop tick ${tick}] ${result.query}\n`);
      process.stdout.write(`  ${(answer.data as Record<string, unknown>).answer as string}\n`);
      rl.prompt();
    }
  });

  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    if (input === "exit" || input === "quit") {
      orchestrator.stopAutoloop();
      console.log("  🦞 Beach with dignity.");
      rl.close();
      process.exit(0);
    }

    if (input === "/help") {
      console.log(HELP);
      rl.prompt();
      return;
    }

    if (input.startsWith("/model ")) {
      currentModel = input.slice(7).trim();
      console.log(`  Model set to: ${currentModel}`);
      rl.prompt();
      return;
    }

    if (input.startsWith("/knowledge ")) {
      const query = input.slice(11).trim();
      const hits = kb.search(query, 8);
      if (hits.length === 0) {
        console.log("  No knowledge entries found.");
      } else {
        console.log(`\n  Found ${hits.length} entries:\n`);
        for (const h of hits) {
          console.log(`  [${h.id}][${h.confidence}] ${h.fact}`);
          console.log(`    → ${h.recommendation}\n`);
        }
      }
      rl.prompt();
      return;
    }

    if (input === "/kb stats") {
      console.log(`  Total entries: ${kb.count()}`);
      console.log(`  High-confidence: ${kb.highConfidence().length}`);
      console.log(`  Types: ${["api_behavior","code_quirk","pattern","gotcha","decision","dependency","performance","security"].join(", ")}`);
      rl.prompt();
      return;
    }

    if (input.startsWith("/research ")) {
      const query = input.slice(10).trim();
      console.log(`  Researching: ${query}...\n`);
      try {
        const result = await orchestrator.research(query);
        const answer = result.findings.find((f) => f.source === "router");
        const birdeye = result.findings.find((f) => f.source === "birdeye");
        if (birdeye && !("error" in (birdeye.data as object))) {
          console.log("  [birdeye] Live chain data fetched.");
        }
        if (answer && typeof (answer.data as Record<string, unknown>).answer === "string") {
          console.log(`\n  ${(answer.data as Record<string, unknown>).answer as string}\n`);
        }
      } catch (e) {
        console.log(`  Error: ${String(e)}`);
      }
      rl.prompt();
      return;
    }

    if (input === "/trending") {
      console.log("  Fetching trending via research orchestrator...");
      try {
        const result = await orchestrator.research("show me trending Solana tokens right now", "market");
        const be = result.findings.find((f) => f.source === "birdeye");
        if (be && (be.data as Record<string, unknown>).trending) {
          const tokens = (be.data as Record<string, { symbol: string; name: string; price: number; volume24hUSD: number }[]>).trending;
          console.log("\n  Trending Solana tokens:\n");
          for (const t of tokens.slice(0, 8)) {
            console.log(`  ${t.symbol.padEnd(10)} ${t.name.padEnd(20)} $${t.price?.toFixed(6) ?? "—"}  vol24h $${Math.round(t.volume24hUSD ?? 0).toLocaleString()}`);
          }
          console.log();
        } else {
          console.log("  Set BIRDEYE_API_KEY to enable live trending data.");
        }
      } catch (e) {
        console.log(`  Error: ${String(e)}`);
      }
      rl.prompt();
      return;
    }

    if (input === "/autoloop start") {
      if (orchestrator.isLoopActive()) {
        console.log("  Autoloop already running.");
      } else {
        orchestrator.startAutoloop(defaultQueries, (result, tick) => {
          const answer = result.findings.find((f) => f.source === "router");
          if (answer && typeof (answer.data as Record<string, unknown>).answer === "string") {
            process.stdout.write(`\n  [tick ${tick}] ${result.query}\n  ${(answer.data as Record<string, unknown>).answer as string}\n`);
            rl.prompt();
          }
        });
        console.log("  Karpathy loop started. Agents are researching.\n");
      }
      rl.prompt();
      return;
    }

    if (input === "/autoloop stop") {
      orchestrator.stopAutoloop();
      console.log(`  Autoloop stopped after ${orchestrator.loopTicks()} ticks.`);
      rl.prompt();
      return;
    }

    // Default: chat with ClawdRouter + knowledge context
    history.push({ role: "user", content: input });
    const systemCtx = kb.buildSystemContext(15);
    const sysMsg = `You are a sovereign Solana research agent powered by OpenClawd.\nYou route through ClawdRouter for intelligence. Be terse and precise.${systemCtx}`;

    process.stdout.write("\n  🦞 ");
    try {
      await router.chatStream(
        [{ role: "system", content: sysMsg }, ...history],
        (chunk) => process.stdout.write(chunk),
        { model: currentModel }
      );
    } catch {
      // fallback: non-streaming
      try {
        const ans = await router.chat(
          [{ role: "system", content: sysMsg }, ...history],
          { model: currentModel }
        );
        process.stdout.write(ans);
        history.push({ role: "assistant", content: ans });
      } catch (e) {
        process.stdout.write(`Error: ${String(e)}`);
      }
    }
    process.stdout.write("\n\n");
    rl.prompt();
  });

  rl.on("close", () => {
    orchestrator.stopAutoloop();
    process.exit(0);
  });
}
