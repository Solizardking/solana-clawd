import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import type { KnowledgeEntry } from "../types.js";

const JSONL_FILES = [
  "facts.jsonl",
  "codebase-facts.jsonl",
  "api-behaviors.jsonl",
  "patterns.jsonl",
  "anti-patterns.jsonl",
  "gotchas.jsonl",
  "decisions.jsonl",
];

export class KnowledgeBase {
  private entries: KnowledgeEntry[] = [];
  private byId = new Map<string, KnowledgeEntry>();
  private byTag = new Map<string, KnowledgeEntry[]>();
  private byType = new Map<string, KnowledgeEntry[]>();
  loaded = false;

  load(knowledgePath: string): void {
    this.entries = [];
    this.byId.clear();
    this.byTag.clear();
    this.byType.clear();

    for (const file of JSONL_FILES) {
      const filePath = join(knowledgePath, file);
      try {
        const lines = readFileSync(filePath, "utf8").split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("{")) continue;
          try {
            const entry = JSON.parse(trimmed) as KnowledgeEntry;
            this.entries.push(entry);
            this.byId.set(entry.id, entry);

            const existing = this.byType.get(entry.type) ?? [];
            existing.push(entry);
            this.byType.set(entry.type, existing);

            for (const tag of entry.tags ?? []) {
              const tagList = this.byTag.get(tag) ?? [];
              tagList.push(entry);
              this.byTag.set(tag, tagList);
            }
          } catch {
            // skip malformed lines
          }
        }
      } catch {
        // skip missing files
      }
    }

    this.loaded = true;
  }

  search(query: string, limit = 5): KnowledgeEntry[] {
    const q = query.toLowerCase();
    const scored: Array<[number, KnowledgeEntry]> = [];
    for (const entry of this.entries) {
      let score = 0;
      if (entry.fact.toLowerCase().includes(q)) score += 3;
      if (entry.recommendation.toLowerCase().includes(q)) score += 2;
      if (entry.tags.some((t) => t.toLowerCase().includes(q))) score += 2;
      if (entry.id.toLowerCase().includes(q)) score += 1;
      if (score > 0) scored.push([score, entry]);
    }
    return scored
      .sort((a, b) => b[0] - a[0])
      .slice(0, limit)
      .map(([, e]) => e);
  }

  get(id: string): KnowledgeEntry | undefined {
    return this.byId.get(id);
  }

  byKind(type: string): KnowledgeEntry[] {
    return this.byType.get(type) ?? [];
  }

  highConfidence(): KnowledgeEntry[] {
    return this.entries.filter((e) => e.confidence === "high");
  }

  count(): number {
    return this.entries.length;
  }

  buildSystemContext(maxEntries = 20): string {
    const high = this.highConfidence().slice(0, maxEntries);
    if (high.length === 0) return "";
    const block = high
      .map((e) => `[${e.id}][${e.type}] ${e.fact} → ${e.recommendation}`)
      .join("\n");
    return `\n\n## OpenClawd Knowledge Base (${high.length} high-confidence facts)\n${block}`;
  }
}
