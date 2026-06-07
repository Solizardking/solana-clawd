import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { printInfo, printOk, printSection, printWarn } from "../banner.js";

// ── Skill resolution ──────────────────────────────────────────────────────────

function getSkillsSearchPaths(cliRoot: string): string[] {
  return [
    // repo skills (local dev)
    join(cliRoot, "../../skills/skills"),
    // agents skills
    join(cliRoot, "../skills"),
    // global installs
    join(homedir(), ".agents", "skills"),
    join(homedir(), ".claude", "skills"),
    join(homedir(), ".openclawd", "skills"),
  ];
}

function findSkillFile(name: string, searchPaths: string[]): string | null {
  for (const base of searchPaths) {
    // exact dir match
    const skill = join(base, name, "SKILL.md");
    if (existsSync(skill)) return skill;
    // prefix match (e.g. "vulcan-grid-trading" under "clawd-agents-cli-workflow")
    if (existsSync(base)) {
      try {
        const entries = readdirSync(base, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && entry.name === name) {
            const candidate = join(base, entry.name, "SKILL.md");
            if (existsSync(candidate)) return candidate;
          }
        }
      } catch { /* skip unreadable dirs */ }
    }
  }
  return null;
}

function listAvailableSkills(searchPaths: string[]): string[] {
  const skills = new Set<string>();
  for (const base of searchPaths) {
    if (!existsSync(base)) continue;
    try {
      const entries = readdirSync(base, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && existsSync(join(base, entry.name, "SKILL.md"))) {
          skills.add(entry.name);
        }
      }
    } catch { /* skip */ }
  }
  return [...skills].sort();
}

// ── Frontmatter stripper ──────────────────────────────────────────────────────

function stripFrontmatter(content: string): string {
  if (!content.startsWith("---")) return content;
  const end = content.indexOf("\n---", 3);
  return end === -1 ? content : content.slice(end + 4).trimStart();
}

// ── Pack builder ──────────────────────────────────────────────────────────────

interface PackOptions {
  skills: string[];
  xml?: boolean;
  outFile?: string;
  list?: boolean;
  json?: boolean;
}

export async function runPack(opts: PackOptions): Promise<void> {
  const thisFile = fileURLToPath(import.meta.url);
  const cliRoot = join(dirname(thisFile), "../..");
  const searchPaths = getSkillsSearchPaths(cliRoot);

  // --list mode: show all discoverable skills
  if (opts.list) {
    const available = listAvailableSkills(searchPaths);
    if (opts.json) {
      console.log(JSON.stringify({ skills: available }, null, 2));
      return;
    }
    printSection("Discoverable Skills");
    console.error(`\n  Search paths:`);
    for (const p of searchPaths) {
      const exists = existsSync(p);
      if (exists) {
        printOk(p);
      } else {
        printInfo(`${p}  (not found)`);
      }
    }
    console.error(`\n  Skills (${available.length}):`);
    for (const s of available) {
      console.error(`    ${s}`);
    }
    return;
  }

  if (opts.skills.length === 0) {
    printWarn("No skills specified. Usage: clawd-agents pack <skill1> [skill2 ...] [--xml] [--out <file>]");
    printInfo("List available: clawd-agents pack --list");
    process.exitCode = 1;
    return;
  }

  const chunks: string[] = [];
  const missing: string[] = [];
  const loaded: string[] = [];

  for (const name of opts.skills) {
    const skillPath = findSkillFile(name, searchPaths);
    if (!skillPath) {
      missing.push(name);
      continue;
    }

    const raw = readFileSync(skillPath, "utf-8");
    const body = stripFrontmatter(raw).trim();

    if (opts.xml) {
      chunks.push(`<skill name="${name}">\n${body}\n</skill>`);
    } else {
      const separator = `${"─".repeat(72)}\n# SKILL: ${name}\n${"─".repeat(72)}`;
      chunks.push(`${separator}\n\n${body}`);
    }

    loaded.push(name);
  }

  if (missing.length > 0) {
    for (const m of missing) {
      printWarn(`Skill not found: ${m}`);
    }
    printInfo("Run 'clawd-agents pack --list' to see available skills");
    printInfo("Run 'clawd-agents setup' to install skills from the registry");
  }

  if (chunks.length === 0) {
    printWarn("No skills could be loaded.");
    process.exitCode = 1;
    return;
  }

  const header = opts.xml
    ? `<context skills="${loaded.join(" ")}" generated="${new Date().toISOString()}">`
    : `# Clawd Context Pack\n# Skills: ${loaded.join(", ")}\n# Generated: ${new Date().toISOString()}\n`;

  const footer = opts.xml ? "</context>" : "";
  const output = [header, ...chunks, footer].join("\n\n");

  if (opts.outFile) {
    // ensure parent dir exists
    const parentDir = dirname(opts.outFile);
    if (parentDir && parentDir !== ".") mkdirSync(parentDir, { recursive: true });
    writeFileSync(opts.outFile, output);
    printSection("Pack Written");
    printOk(opts.outFile);
    printInfo(`${loaded.length} skill(s) packed  (${Buffer.byteLength(output)} bytes)`);
    if (missing.length > 0) printWarn(`${missing.length} skill(s) not found: ${missing.join(", ")}`);
    printInfo("Use at session start by pasting into System Instructions or attaching as a file.");
  } else {
    // stdout for piping / redirect
    console.log(output);
    if (!opts.json) {
      process.stderr.write(`\n  Packed: ${loaded.join(", ")}${missing.length ? `\n  Missing: ${missing.join(", ")}` : ""}\n`);
    }
  }
}
