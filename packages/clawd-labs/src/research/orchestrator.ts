import { randomUUID } from "node:crypto";
import type { ResearchResult, LabsConfig } from "../types.js";
import { BirdeyeClient } from "./birdeye.js";
import type { KnowledgeBase } from "../knowledge/loader.js";
import type { ClawdRouterClient } from "../router/client.js";

export type ResearchFocus = "chain" | "defi" | "market" | "knowledge";

export class ResearchOrchestrator {
  private birdeye: BirdeyeClient | null = null;
  private loopActive = false;
  private loopCount = 0;

  constructor(
    private config: LabsConfig,
    private kb: KnowledgeBase,
    private router: ClawdRouterClient
  ) {
    if (config.birdeyeApiKey) {
      this.birdeye = new BirdeyeClient(config.birdeyeApiKey);
    }
  }

  async research(query: string, focus: ResearchFocus = "chain"): Promise<ResearchResult> {
    const loopId = randomUUID();
    const result: ResearchResult = {
      query,
      timestamp: new Date().toISOString(),
      findings: [],
      loopId,
    };

    // 1. Sense — pull knowledge base facts
    const kbHits = this.kb.search(query, 5);
    if (kbHits.length > 0) {
      result.findings.push({ source: "knowledge", data: kbHits });
    }

    // 2. Sense — pull live chain data (Birdeye)
    if (this.birdeye && (focus === "chain" || focus === "market")) {
      try {
        const trending = await this.birdeye.trending(8);
        result.findings.push({ source: "birdeye", data: { trending } });
      } catch (e) {
        result.findings.push({ source: "birdeye", data: { error: String(e) } });
      }
    }

    // 3. Think — route through ClawdRouter with context
    const kbContext = kbHits
      .map((e) => `[${e.id}] ${e.fact}`)
      .join("\n");

    const systemPrompt = [
      "You are Clawd Labs Research, an autonomous Solana intelligence agent.",
      "You have access to live Birdeye market data and a curated knowledge base.",
      "Respond with concrete findings, token addresses, and actionable signals.",
      kbContext ? `\nKnowledge base context:\n${kbContext}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const chainContext = result.findings
      .filter((f) => f.source === "birdeye")
      .map((f) => JSON.stringify(f.data, null, 2))
      .join("\n");

    const userMsg = chainContext
      ? `Query: ${query}\n\nLive chain data:\n${chainContext}`
      : `Query: ${query}`;

    try {
      const answer = await this.router.chat([
        { role: "system", content: systemPrompt },
        { role: "user", content: userMsg },
      ]);
      result.findings.push({ source: "router", data: { answer } });
    } catch (e) {
      result.findings.push({ source: "router", data: { error: String(e) } });
    }

    return result;
  }

  // Karpathy loop: continuous background research
  startAutoloop(
    queries: string[],
    onTick: (result: ResearchResult, tick: number) => void
  ): void {
    if (this.loopActive) return;
    this.loopActive = true;
    this.loopCount = 0;

    const tick = async () => {
      if (!this.loopActive) return;
      const query = queries[this.loopCount % queries.length] ?? "trending Solana tokens";
      try {
        const result = await this.research(query, "chain");
        onTick(result, this.loopCount);
      } catch {
        // continue loop on error
      }
      this.loopCount++;
      if (this.loopActive) {
        setTimeout(tick, this.config.loopIntervalMs);
      }
    };

    setTimeout(tick, 0);
  }

  stopAutoloop(): void {
    this.loopActive = false;
  }

  isLoopActive(): boolean {
    return this.loopActive;
  }

  loopTicks(): number {
    return this.loopCount;
  }
}
