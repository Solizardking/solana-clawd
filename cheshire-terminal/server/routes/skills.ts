import { Router } from "express";
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";

const router = Router();
const SOLANA_CLAWD_REPO = "https://github.com/Solizardking/solana-clawd";
const SOLANA_CLAWD_BRANCH = "newnew";
const SOLANA_CLAWD_SKILLS_URL = `${SOLANA_CLAWD_REPO}/tree/${SOLANA_CLAWD_BRANCH}/skills`;
const SOLANA_CLAWD_ARENA_URL = `${SOLANA_CLAWD_REPO}/tree/${SOLANA_CLAWD_BRANCH}/agent-arena`;
const ARENA_INSTALL_URL = `https://raw.githubusercontent.com/Solizardking/solana-clawd/${SOLANA_CLAWD_BRANCH}/cheshire-terminal/arena/install.sh`;

type LocalSkill = {
  slug: string;
  name: string;
  displayName: string;
  sourcePath: string;
  upstreamUrl: string | null;
  version: string;
  description: string;
  homepage: string | null;
  author: string | null;
  license: string | null;
  tags: string[];
  payment: unknown;
  readme: string;
  skillMd: string;
  examples: Array<{
    filename: string;
    path: string;
    language: string;
    content: string;
  }>;
  meta: Record<string, unknown>;
};

function parseFrontmatter(markdown: string) {
  if (!markdown.startsWith("---")) return { attrs: {} as Record<string, unknown>, body: markdown };
  const end = markdown.indexOf("\n---", 3);
  if (end < 0) return { attrs: {} as Record<string, unknown>, body: markdown };

  const raw = markdown.slice(3, end).trimEnd();
  const lines = raw.split("\n");
  const attrs: Record<string, unknown> = {};
  let currentKey: string | null = null;
  let blockKey: string | null = null;
  let blockIndent = 0;
  let blockLines: string[] = [];

  const flushBlock = () => {
    if (!blockKey) return;
    attrs[blockKey] = blockLines.map((line) => line.trim()).join(" ").replace(/\s+/g, " ").trim();
    blockKey = null;
    blockIndent = 0;
    blockLines = [];
  };

  for (const line of lines) {
    if (blockKey) {
      const indent = line.match(/^\s*/)?.[0].length ?? 0;
      if (line.trim() && indent >= blockIndent) {
        blockLines.push(line);
        continue;
      }
      flushBlock();
    }

    const topLevel = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (topLevel) {
      currentKey = topLevel[1];
      const value = topLevel[2].trim();
      if (value === ">" || value === "|") {
        blockKey = currentKey;
        blockIndent = 1;
        blockLines = [];
        continue;
      }
      if (value.startsWith("[") && value.endsWith("]")) {
        attrs[currentKey] = value
          .slice(1, -1)
          .split(",")
          .map((item) => item.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
      } else if (value.length > 0) {
        attrs[currentKey] = value.replace(/^["']|["']$/g, "");
      } else {
        attrs[currentKey] = {};
      }
      continue;
    }

    const listItem = /^\s+-\s*(.*)$/.exec(line);
    if (listItem && currentKey) {
      const existing = Array.isArray(attrs[currentKey]) ? attrs[currentKey] as string[] : [];
      existing.push(listItem[1].trim());
      attrs[currentKey] = existing;
    }
  }
  flushBlock();

  return { attrs, body: markdown.slice(end + 4).trim() };
}

function languageFor(filename: string) {
  if (filename.endsWith(".ts")) return "typescript";
  if (filename.endsWith(".json")) return "json";
  if (filename.endsWith(".md")) return "markdown";
  return "text";
}

function slugFor(skillDir: string) {
  return skillDir.split(/[\\/]/).filter(Boolean).join("--");
}

function upstreamUrlFor(skillDir: string) {
  if (skillDir.startsWith(".agents/skills/")) {
    const upstreamPath = skillDir.replace(/^\.agents\/skills\//, "");
    return `${SOLANA_CLAWD_SKILLS_URL}/${upstreamPath}`;
  }
  if (skillDir === "agent-arena" || skillDir === "agent-arena-skill") {
    return SOLANA_CLAWD_ARENA_URL;
  }
  return null;
}

function findSkillDirs(rootDir: string) {
  const root = join(process.cwd(), rootDir);
  if (!existsSync(root)) return [];

  const dirs: string[] = [];
  const visit = (dir: string) => {
    const skillPath = join(dir, "SKILL.md");
    if (existsSync(skillPath)) {
      dirs.push(relative(process.cwd(), dir).split(sep).join("/"));
    }

    for (const entry of readdirSync(dir).sort()) {
      if (entry.startsWith(".") || entry === "node_modules" || entry === "target" || entry === "dist") continue;
      const child = join(dir, entry);
      const childStat = lstatSync(child);
      if (childStat.isSymbolicLink()) continue;
      if (childStat.isDirectory()) visit(child);
    }
  };

  visit(root);
  return dirs;
}

function readLocalSkill(dirName: string): LocalSkill | null {
  const root = join(process.cwd(), dirName);
  const skillPath = join(root, "SKILL.md");
  if (!existsSync(skillPath)) return null;

  const skillMd = readFileSync(skillPath, "utf8");
  const { attrs, body } = parseFrontmatter(skillMd);
  const metaPath = join(root, "_meta.json");
  const readmePath = join(root, "README.md");
  const examplesDir = join(root, "examples");
  const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : {};
  const readme = existsSync(readmePath) ? readFileSync(readmePath, "utf8") : "";

  const examples = existsSync(examplesDir) && statSync(examplesDir).isDirectory()
    ? readdirSync(examplesDir)
        .filter((filename) => statSync(join(examplesDir, filename)).isFile())
        .sort()
        .map((filename) => ({
          filename,
          path: `${dirName}/examples/${filename}`,
          language: languageFor(filename),
          content: readFileSync(join(examplesDir, filename), "utf8"),
        }))
    : [];

  return {
    slug: String((meta as any).slug || slugFor(dirName)),
    name: String(attrs.name || (meta as any).slug || basename(dirName)),
    displayName: String((meta as any).displayName || attrs.name || basename(dirName)),
    sourcePath: dirName,
    upstreamUrl: upstreamUrlFor(dirName),
    version: String(attrs.version || (meta as any).latest?.version || ""),
    description: String(attrs.description || ""),
    homepage: typeof attrs.homepage === "string" ? attrs.homepage : null,
    author: typeof attrs.author === "string" ? attrs.author : null,
    license: typeof attrs.license === "string" ? attrs.license : null,
    tags: Array.isArray(attrs.tags) ? attrs.tags.map(String) : [],
    payment: attrs.payment ?? null,
    readme,
    skillMd: body,
    examples,
    meta,
  };
}

function localSkills() {
  const dirs = new Set<string>([
    "agent-arena-skill",
    "agent-arena",
    ...findSkillDirs(".agents/skills"),
  ]);
  return Array.from(dirs)
    .map(readLocalSkill)
    .filter((skill): skill is LocalSkill => Boolean(skill))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

router.get("/", (_req, res) => {
  const skills = localSkills();
  res.json({
    count: skills.length,
    upstream: {
      repository: SOLANA_CLAWD_REPO,
      branch: SOLANA_CLAWD_BRANCH,
      skillsUrl: SOLANA_CLAWD_SKILLS_URL,
      arenaUrl: SOLANA_CLAWD_ARENA_URL,
      arenaInstallUrl: ARENA_INSTALL_URL,
      arenaInstallCommand: `curl -fsSL ${ARENA_INSTALL_URL} | bash`,
    },
    skills: skills.map(({ skillMd, readme, examples, ...skill }) => ({
      ...skill,
      readmeExcerpt: readme.slice(0, 1200),
      exampleCount: examples.length,
      examples: examples.map(({ content, ...example }) => ({
        ...example,
        size: content.length,
      })),
    })),
  });
});

router.get("/:slug", (req, res) => {
  const skill = localSkills().find((item) => item.slug === req.params.slug || item.name === req.params.slug);
  if (!skill) return res.status(404).json({ error: "skill not found" });
  res.json(skill);
});

export default router;
