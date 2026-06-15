/**
 * Skills Tools — Agent Skill Catalog Integration for Solana Clawd MCP
 *
 * Exposes the /skills directory as callable MCP tools:
 *   skills_catalog     — Full catalog with metadata (from catalog.json)
 *   skills_search      — Fuzzy search by name, description, or category
 *   skills_list        — List skill slugs with one-liner descriptions
 *   skills_load        — Read a specific skill's SKILL.md content
 *   skills_categories  — List all categories with skill counts
 *
 * The /skills directory contains 137+ attested agent skills covering
 * Solana DeFi, AI agents, dev tools, trading, security, and more.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ToolCategory, ToolDef, ToolHandler } from "../orchestrator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const SKILLS_ROOT = path.resolve(__dirname, "..", "..", "..", "skills");

// ─── Types ────────────────────────────────────────────────────────────────────

interface SkillCatalogEntry {
  slug: string;
  name: string;
  description: string;
  category: string;
  homepage?: string;
  manifest?: string;
  attested?: boolean;
  attested_at?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function loadCatalog(): Promise<SkillCatalogEntry[]> {
  try {
    const raw = await fs.readFile(path.join(SKILLS_ROOT, "catalog.json"), "utf-8");
    return JSON.parse(raw) as SkillCatalogEntry[];
  } catch {
    // Fallback: scan directory for skill folders
    const entries = await fs.readdir(SKILLS_ROOT, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && e.name !== "node_modules")
      .map((e) => ({
        slug: e.name,
        name: e.name,
        description: `Skill: ${e.name}`,
        category: "Unknown",
      }));
  }
}

function scoreMatch(entry: SkillCatalogEntry, query: string): number {
  const q = query.toLowerCase();
  const haystack = `${entry.slug} ${entry.name} ${entry.description} ${entry.category}`.toLowerCase();
  if (entry.slug.toLowerCase() === q) return 100;
  if (entry.name.toLowerCase() === q) return 95;
  if (entry.slug.toLowerCase().startsWith(q)) return 80;
  if (entry.name.toLowerCase().startsWith(q)) return 75;
  if (entry.slug.toLowerCase().includes(q)) return 60;
  if (haystack.includes(q)) return 40;
  // Word-level matching
  const words = q.split(/\s+/);
  const matches = words.filter((w) => haystack.includes(w)).length;
  return matches > 0 ? (matches / words.length) * 30 : 0;
}

async function readSkillContent(slug: string): Promise<string | null> {
  const candidates = [
    path.join(SKILLS_ROOT, slug, "SKILL.md"),
    path.join(SKILLS_ROOT, slug, "index.md"),
    path.join(SKILLS_ROOT, slug, "README.md"),
  ];
  for (const p of candidates) {
    try {
      return await fs.readFile(p, "utf-8");
    } catch {
      continue;
    }
  }
  return null;
}

// ─── Tool Definitions ─────────────────────────────────────────────────────────

const SKILLS_CATEGORY: ToolCategory = "skills";

export function createSkillsTools(): Array<[ToolDef, ToolHandler]> {
  return [
    // ── skills_catalog ──────────────────────────────────────────────────────
    [
      {
        name: "skills_catalog",
        description:
          "[Skills] Return the full agent skill catalog — 137+ attested skills covering Solana DeFi, AI agents, dev tools, trading, security, and productivity. Each entry has slug, description, category, homepage, and attestation status.",
        inputSchema: {
          type: "object",
          properties: {
            category: {
              type: "string",
              description: "Filter by category (optional). E.g. 'DeFi / Solana', 'Dev Tools / Agents'.",
            },
            attested_only: {
              type: "boolean",
              description: "If true, return only attested skills (default: false).",
            },
          },
        },
        category: SKILLS_CATEGORY,
      },
      async (args) => {
        const catalog = await loadCatalog();
        let filtered = catalog;
        if (args.category) {
          const cat = String(args.category).toLowerCase();
          filtered = filtered.filter((e) => e.category.toLowerCase().includes(cat));
        }
        if (args.attested_only === true) {
          filtered = filtered.filter((e) => e.attested === true);
        }
        return {
          total: filtered.length,
          categories: [...new Set(filtered.map((e) => e.category))].sort(),
          skills: filtered.map((e) => ({
            slug: e.slug,
            name: e.name,
            description: e.description,
            category: e.category,
            attested: e.attested ?? false,
            homepage: e.homepage,
          })),
        };
      },
    ],

    // ── skills_search ───────────────────────────────────────────────────────
    [
      {
        name: "skills_search",
        description:
          "[Skills] Search the skill catalog by name, description, or category. Returns ranked results. Use to find the right skill before loading it.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query (e.g. 'vulcan trading', 'solana wallet', 'github')." },
            limit: { type: "number", description: "Max results to return (default: 10)." },
          },
          required: ["query"],
        },
        category: SKILLS_CATEGORY,
      },
      async (args) => {
        const query = String(args.query);
        const limit = Number(args.limit ?? 10);
        const catalog = await loadCatalog();
        const scored = catalog
          .map((e) => ({ entry: e, score: scoreMatch(e, query) }))
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);
        return {
          query,
          total_matches: scored.length,
          results: scored.map(({ entry, score }) => ({
            slug: entry.slug,
            name: entry.name,
            description: entry.description,
            category: entry.category,
            score,
            attested: entry.attested ?? false,
            homepage: entry.homepage,
          })),
        };
      },
    ],

    // ── skills_list ─────────────────────────────────────────────────────────
    [
      {
        name: "skills_list",
        description:
          "[Skills] List all skill slugs with one-liner descriptions, grouped by category. Lightweight alternative to skills_catalog for quick orientation.",
        inputSchema: {
          type: "object",
          properties: {},
        },
        category: SKILLS_CATEGORY,
      },
      async () => {
        const catalog = await loadCatalog();
        const byCategory: Record<string, string[]> = {};
        for (const e of catalog) {
          const cat = e.category ?? "Other";
          if (!byCategory[cat]) byCategory[cat] = [];
          byCategory[cat].push(`${e.slug}: ${e.description.slice(0, 80)}${e.description.length > 80 ? "…" : ""}`);
        }
        return {
          total: catalog.length,
          by_category: byCategory,
        };
      },
    ],

    // ── skills_load ─────────────────────────────────────────────────────────
    [
      {
        name: "skills_load",
        description:
          "[Skills] Load a specific skill's full SKILL.md (or index.md / README.md) content by slug. Read this before implementing anything the skill covers.",
        inputSchema: {
          type: "object",
          properties: {
            slug: { type: "string", description: "Skill slug (e.g. 'vulcan', 'github', 'clawd-guard-secrets')." },
          },
          required: ["slug"],
        },
        category: SKILLS_CATEGORY,
      },
      async (args) => {
        const slug = String(args.slug);
        const content = await readSkillContent(slug);
        if (!content) {
          return {
            error: `Skill '${slug}' not found or has no SKILL.md / index.md / README.md.`,
            hint: "Use skills_search to find valid skill slugs.",
          };
        }
        // Also return catalog metadata if available
        const catalog = await loadCatalog();
        const meta = catalog.find((e) => e.slug === slug);
        return {
          slug,
          name: meta?.name ?? slug,
          category: meta?.category ?? "Unknown",
          attested: meta?.attested ?? false,
          homepage: meta?.homepage,
          content,
          length: content.length,
        };
      },
    ],

    // ── skills_categories ───────────────────────────────────────────────────
    [
      {
        name: "skills_categories",
        description:
          "[Skills] List all skill categories with counts and representative skills. Use to orient before searching or browsing the catalog.",
        inputSchema: {
          type: "object",
          properties: {},
        },
        category: SKILLS_CATEGORY,
      },
      async () => {
        const catalog = await loadCatalog();
        const byCategory: Record<string, { count: number; examples: string[]; attested: number }> = {};
        for (const e of catalog) {
          const cat = e.category ?? "Other";
          if (!byCategory[cat]) byCategory[cat] = { count: 0, examples: [], attested: 0 };
          byCategory[cat].count++;
          if (byCategory[cat].examples.length < 4) byCategory[cat].examples.push(e.slug);
          if (e.attested) byCategory[cat].attested++;
        }
        return {
          total_skills: catalog.length,
          categories: Object.entries(byCategory)
            .sort(([, a], [, b]) => b.count - a.count)
            .map(([name, stats]) => ({ category: name, ...stats })),
        };
      },
    ],
  ];
}
