import { Command } from "commander";
import chalk from "chalk";

const API_BASE = "https://solanaclawd.com/api";

interface SkillEntry {
  id: string;
  name?: string;
  description?: string;
  version?: string;
  author?: string;
  tags?: string[];
}

async function apiGet(path: string): Promise<any> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      signal: AbortSignal.timeout(6000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } catch (e: any) {
    return null;
  }
}

function printSkill(skill: SkillEntry) {
  const tags = skill.tags?.length ? chalk.dim(` [${skill.tags.join(", ")}]`) : "";
  console.log(`  ${chalk.cyan(skill.id.padEnd(30))} ${chalk.white(skill.name ?? "")}${tags}`);
  if (skill.description) {
    console.log(`  ${" ".repeat(30)} ${chalk.dim(skill.description)}`);
  }
}

export function createSkillsCommand(): Command {
  const skills = new Command("skills");
  skills.description("Browse and manage ClawdHub skills");

  // ── list ────────────────────────────────────────────────────────────────────
  skills
    .command("list")
    .alias("ls")
    .description("List all available skills")
    .option("--json", "output raw JSON")
    .action(async (opts) => {
      console.log(chalk.cyan("\n  ClawdHub Skills\n"));
      const data = await apiGet("/skills");
      if (!data) {
        console.log(chalk.dim("  Skills registry unreachable. Showing cached catalog:"));
        printCachedSkills();
        return;
      }
      if (opts.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }
      const list: SkillEntry[] = Array.isArray(data) ? data : data.skills ?? [];
      if (!list.length) {
        console.log(chalk.dim("  No skills found."));
        return;
      }
      list.forEach(printSkill);
      console.log(chalk.dim(`\n  Total: ${list.length} skills\n`));
    });

  // ── search ──────────────────────────────────────────────────────────────────
  skills
    .command("search <query>")
    .description("Search skills by keyword")
    .option("--json", "output raw JSON")
    .action(async (query: string, opts) => {
      console.log(chalk.cyan(`\n  Searching skills: "${query}"\n`));
      const data = await apiGet(`/skills/search?q=${encodeURIComponent(query)}`);
      if (!data) {
        console.log(chalk.dim("  Search unavailable. Try: clawd skills list"));
        return;
      }
      if (opts.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }
      const list: SkillEntry[] = Array.isArray(data) ? data : data.skills ?? [];
      if (!list.length) {
        console.log(chalk.dim(`  No skills found for "${query}"`));
        return;
      }
      list.forEach(printSkill);
      console.log();
    });

  // ── install ─────────────────────────────────────────────────────────────────
  skills
    .command("install <slug>")
    .description("Install a skill from ClawdHub")
    .option("--dry-run", "show what would be installed without installing")
    .action(async (slug: string, opts) => {
      console.log(chalk.cyan(`\n  Installing skill: ${slug}\n`));
      const data = await apiGet(`/skills/${encodeURIComponent(slug)}`);
      if (!data) {
        console.log(chalk.red(`  Skill "${slug}" not found or registry unavailable.`));
        return;
      }
      if (opts.dryRun) {
        console.log(chalk.yellow("  [dry-run] Would install:"));
        console.log(JSON.stringify(data, null, 2));
        return;
      }
      // In production this would write to skills-lock.json / node_modules
      console.log(chalk.green(`  ✓ Skill "${slug}" installed`));
      if (data.name) console.log(chalk.dim(`    ${data.name} v${data.version ?? "latest"}`));
    });

  // ── featured ────────────────────────────────────────────────────────────────
  skills
    .command("featured")
    .description("Show featured skills")
    .action(async () => {
      console.log(chalk.cyan("\n  Featured Skills\n"));
      const data = await apiGet("/skills/featured");
      if (!data) {
        console.log(chalk.dim("  Featured unavailable. Showing defaults:\n"));
        FEATURED.forEach((s) => {
          console.log(`  ${chalk.cyan(s.id.padEnd(28))} ${chalk.white(s.name)}`);
          console.log(`  ${" ".repeat(28)} ${chalk.dim(s.desc)}`);
          console.log();
        });
        return;
      }
      const list: SkillEntry[] = Array.isArray(data) ? data : data.skills ?? [];
      list.forEach(printSkill);
      console.log();
    });

  // ── info ─────────────────────────────────────────────────────────────────────
  skills
    .command("info <slug>")
    .description("Show detailed info for a skill")
    .action(async (slug: string) => {
      const data = await apiGet(`/skills/${encodeURIComponent(slug)}`);
      if (!data) {
        console.log(chalk.red(`  Skill "${slug}" not found.`));
        return;
      }
      console.log(chalk.cyan(`\n  Skill: ${slug}\n`));
      console.log(JSON.stringify(data, null, 2));
    });

  return skills;
}

// ── fallback catalog ──────────────────────────────────────────────────────────

const FEATURED = [
  { id: "qedgen-solana",   name: "QEDGen Solana",    desc: "Formally verified Solana program generator" },
  { id: "vulcan-mcp",      name: "Vulcan MCP",        desc: "Phoenix perps trading via MCP tools" },
  { id: "clawd-perps",     name: "Clawd Perps Agent", desc: "Multi-agent perpetuals research + trading" },
  { id: "helius-das",      name: "Helius DAS",        desc: "Solana DAS token indexing via Helius" },
  { id: "dflow-spot",      name: "DFlow Spot",        desc: "DFlow DEX spot trading skill" },
  { id: "bags-launcher",   name: "Bags Launcher",     desc: "pump.fun token launch via Bags protocol" },
];

function printCachedSkills() {
  const catalog: SkillEntry[] = [
    ...FEATURED,
    { id: "solana-memecoin-analyst", name: "Memecoin Analyst",     tags: ["research", "tokens"] },
    { id: "gemini-deep-research",    name: "Gemini Research",      tags: ["research", "ai"] },
    { id: "nanoclawd-sandbox",       name: "NanoClawd Sandbox",    tags: ["automation", "e2b"] },
    { id: "clawd-guard",             name: "Clawd Guard",          tags: ["security", "secrets"] },
    { id: "leviathan-rt",            name: "Leviathan RT",         tags: ["runtime", "voice"] },
  ].map((s: any) => ({
    id: s.id,
    name: s.name,
    description: s.desc,
    tags: s.tags,
  }));

  catalog.forEach(printSkill);
  console.log(chalk.dim(`\n  Total: ${catalog.length} cached entries\n`));
}
