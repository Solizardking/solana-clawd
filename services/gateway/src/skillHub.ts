/**
 * gateway/src/skillHub.ts
 *
 * Express router for the Skill Hub API.
 * All read endpoints are public. Write endpoints require a valid
 * authority signature header (X-Authority-Pubkey + X-Signature).
 */
import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

const router = Router();

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

function findRepoRoot(): string {
  let current = MODULE_DIR;
  for (let i = 0; i < 8; i += 1) {
    if (fs.existsSync(path.join(current, 'skills', 'catalog.json'))) {
      return current;
    }
    const next = path.dirname(current);
    if (next === current) break;
    current = next;
  }
  return process.cwd();
}

const REPO_ROOT = findRepoRoot();
const SKILLS_ROOT = path.join(REPO_ROOT, 'skills');
const PUBLIC_BASE_URL = process.env.GATEWAY_BASE_URL ?? 'https://x402.wtf';

type ComponentKind = 'agent' | 'skill' | 'plugin' | 'mcp_server' | 'program';

interface CatalogEntry {
  slug: string;
  name: string;
  description: string;
  category: string;
  path?: string;
  homepage?: string;
  manifest?: string;
}

interface SkillHubEntry {
  skill_id: string;
  slug: string;
  name: string;
  kind: ComponentKind;
  stride_score: number;
  kani_verified: boolean;
  spec_hash: string;
  authority: string;
  metadata_uri: string;
  registered_at: string;
  active: boolean;
  on_chain?: boolean;
  sas_attestation?: string;
}

interface SkillHubModule {
  listSkills(filter?: { kind?: ComponentKind; active?: boolean }): SkillHubEntry[];
  getSkillById(skillId: string): SkillHubEntry | undefined;
  getSkillBySlug(slug: string): SkillHubEntry | undefined;
  registerSkill(opts: {
    slug: string;
    name: string;
    kind: ComponentKind;
    authority: string;
    metadata_uri?: string;
    component_path?: string;
    kani_verified?: boolean;
  }): Promise<{
    skill_id: string;
    entry: SkillHubEntry;
    verification: { stride_score: number };
  }>;
  revokeSkill(skillId: string, authority: string): void;
  loadCatalog(): CatalogEntry[];
  catalogEntryToKind(entry: CatalogEntry): ComponentKind;
}

const skillHubModule = await import(
  pathToFileURL(path.join(REPO_ROOT, 'trading', 'formal_verification', 'skill-hub.js')).href
) as SkillHubModule;

const {
  listSkills,
  getSkillById,
  getSkillBySlug,
  registerSkill,
  revokeSkill,
  loadCatalog,
  catalogEntryToKind,
} = skillHubModule;

const metadataRouteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

const AMP = '&amp;';
const LT = '&lt;';
const GT = '&gt;';
const QUOT = '&quot;';
const APOS = '&apos;';

function escapeForXml(value: string): string {
  return value
    .replace(/&/g, AMP)
    .replace(/</g, LT)
    .replace(/>/g, GT)
    .replace(/"/g, QUOT)
    .replace(/'/g, APOS);
}

function resolveSkillDocPath(slug: string, candidate: string): string | null {
  const target = path.resolve(SKILLS_ROOT, slug, candidate);
  const rel = path.relative(SKILLS_ROOT, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return target;
}

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function withPublicCatalogLinks(entry: CatalogEntry): CatalogEntry {
  return {
    ...entry,
    homepage: entry.homepage ?? `${PUBLIC_BASE_URL}/skills/${entry.slug}`,
    manifest: entry.manifest ?? `${PUBLIC_BASE_URL}/api/skills/slug/${entry.slug}/metadata.json`,
  };
}

type PublicSkillEntry = SkillHubEntry | (CatalogEntry & {
  kind: ComponentKind;
  active: boolean;
  metadata_uri: string;
  registryBacked: false;
});

function getCatalogEntryBySlug(slug: string): CatalogEntry | undefined {
  const entry = loadCatalog().find((candidate) => candidate.slug === slug);
  return entry ? withPublicCatalogLinks(entry) : undefined;
}

function getPublicSkillBySlug(slug: string): PublicSkillEntry | undefined {
  const registered = getSkillBySlug(slug);
  if (registered) return registered;

  const catalogEntry = getCatalogEntryBySlug(slug);
  if (!catalogEntry) return undefined;

  return {
    ...catalogEntry,
    kind: catalogEntryToKind(catalogEntry),
    active: true,
    metadata_uri: `${PUBLIC_BASE_URL}/api/skills/slug/${catalogEntry.slug}/metadata.json`,
    registryBacked: false as const,
  };
}

function listPublicSkills(kindFilter?: ComponentKind, activeOnly = true): PublicSkillEntry[] {
  const registered = listSkills({ kind: kindFilter, active: activeOnly });
  const registeredSlugs = new Set(registered.map((entry) => entry.slug));
  const catalogFallbacks = loadCatalog()
    .map(withPublicCatalogLinks)
    .filter((entry) => !registeredSlugs.has(entry.slug))
    .map((entry) => ({
      ...entry,
      kind: catalogEntryToKind(entry),
      active: true,
      metadata_uri: `${PUBLIC_BASE_URL}/api/skills/slug/${entry.slug}/metadata.json`,
      registryBacked: false as const,
    }))
    .filter((entry) => !kindFilter || entry.kind === kindFilter)
    .filter((entry) => !activeOnly || entry.active);

  return [...registered, ...catalogFallbacks].sort((a, b) => a.slug.localeCompare(b.slug));
}

function verifyAuthoritySignature(authority: string, signature: string | undefined, body: unknown): boolean {
  if (!signature) return false;
  try {
    const payload = JSON.stringify(body ?? {});
    const messageBytes = new TextEncoder().encode(payload);
    const signatureBytes = bs58.decode(signature);
    const pubKeyBytes = bs58.decode(authority);
    return nacl.sign.detached.verify(messageBytes, signatureBytes, pubKeyBytes);
  } catch {
    return false;
  }
}

function cacheHeaders(seconds: number) {
  return (_req: Request, res: Response, next: () => void) => {
    res.setHeader('Cache-Control', `public, max-age=${seconds}`);
    next();
  };
}

router.get('/api/skills', cacheHeaders(30), (req: Request, res: Response) => {
  try {
    const kindFilter = req.query.kind as ComponentKind | undefined;
    const activeOnly = req.query.active !== 'false';
    const skills = listPublicSkills(kindFilter, activeOnly);
    res.json({ count: skills.length, skills });
  } catch (err: unknown) {
    const e = err as Error;
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/skills/catalog', cacheHeaders(120), (_req: Request, res: Response) => {
  try {
    const catalog = loadCatalog().map(withPublicCatalogLinks);
    res.json({ count: catalog.length, catalog });
  } catch (err: unknown) {
    const e = err as Error;
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/skills/kinds', cacheHeaders(60), (_req: Request, res: Response) => {
  const skills = listPublicSkills(undefined, true);
  const counts: Record<string, number> = {};
  for (const s of skills) {
    counts[s.kind] = (counts[s.kind] ?? 0) + 1;
  }
  res.json({ kinds: counts });
});

router.get('/api/skills/:skillId([0-9a-f]{64})', cacheHeaders(60), (req: Request, res: Response) => {
  const entry = getSkillById(firstParam(req.params.skillId));
  if (!entry) {
    res.status(404).json({ error: 'Skill not found' });
    return;
  }
  res.json(entry);
});

router.get('/api/skills/slug/:slug', cacheHeaders(60), (req: Request, res: Response) => {
  const entry = getPublicSkillBySlug(firstParam(req.params.slug));
  if (!entry) {
    res.status(404).json({ error: 'Skill not found' });
    return;
  }
  res.json(entry);
});

router.get('/api/skills/slug/:slug/metadata.json', cacheHeaders(300), metadataRouteLimiter, (req: Request, res: Response) => {
  const entry = getPublicSkillBySlug(firstParam(req.params.slug));
  if (!entry || !entry.active) {
    res.status(404).json({ error: 'Skill not found or inactive' });
    return;
  }

  let description = '';
  for (const candidate of ['README.md', 'skill.md', 'SKILL.md']) {
    const fp = resolveSkillDocPath(entry.slug, candidate);
    if (!fp) continue;
    if (fs.existsSync(fp)) {
      description = fs.readFileSync(fp, 'utf8').slice(0, 500);
      break;
    }
  }

  res.json({
    name: entry.name,
    description: description || ('description' in entry ? entry.description : '') || entry.slug,
    image: `${PUBLIC_BASE_URL}/api/skills/slug/${entry.slug}/card.svg`,
    external_url: `${PUBLIC_BASE_URL}/skills/${entry.slug}`,
    attributes: [
      { trait_type: 'Kind', value: entry.kind },
      { trait_type: 'STRIDE Score', value: 'stride_score' in entry ? entry.stride_score : 'catalog-only' },
      { trait_type: 'Kani Verified', value: 'kani_verified' in entry ? String(entry.kani_verified) : 'catalog-only' },
      { trait_type: 'Active', value: String(entry.active) },
      { trait_type: 'Registered At', value: 'registered_at' in entry ? entry.registered_at : 'catalog-only' },
    ],
    properties: {
      skill_id: 'skill_id' in entry ? entry.skill_id : null,
      spec_hash: 'spec_hash' in entry ? entry.spec_hash : null,
      authority: 'authority' in entry ? entry.authority : null,
      on_chain: 'on_chain' in entry ? entry.on_chain ?? false : false,
      catalog_homepage: 'homepage' in entry ? entry.homepage : `https://x402.wtf/skills/${entry.slug}`,
      catalog_manifest: 'manifest' in entry ? entry.manifest : entry.metadata_uri,
    },
  });
});

router.get('/api/skills/slug/:slug/card.svg', cacheHeaders(600), (req: Request, res: Response) => {
  const slug = firstParam(req.params.slug);
  const entry = getPublicSkillBySlug(slug);
  const name = entry?.name ?? slug;
  const score = entry && 'stride_score' in entry ? entry.stride_score : 0;
  const kind = entry?.kind ?? 'skill';
  const scoreColor = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
  const safeName = escapeForXml(name.slice(0, 30));
  const safeKind = escapeForXml(kind.toUpperCase());
  const safeSkillIdPrefix = escapeForXml(entry && 'skill_id' in entry ? entry.skill_id.slice(0, 16) : 'catalog-only');

  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="160" viewBox="0 0 400 160">' +
    '<defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">' +
    '<stop offset="0%" style="stop-color:#0f172a"/>' +
    '<stop offset="100%" style="stop-color:#1e293b"/>' +
    '</linearGradient></defs>' +
    '<rect width="400" height="160" rx="12" fill="url(#bg)"/>' +
    '<rect x="0" y="0" width="4" height="160" rx="2" fill="' + scoreColor + '"/>' +
    '<text x="24" y="44" font-family="monospace" font-size="18" font-weight="bold" fill="#f8fafc">' + safeName + '</text>' +
    '<text x="24" y="70" font-family="monospace" font-size="12" fill="#94a3b8">' + safeKind + '</text>' +
    '<text x="24" y="110" font-family="monospace" font-size="11" fill="#64748b">STRIDE</text>' +
    '<text x="24" y="130" font-family="monospace" font-size="22" font-weight="bold" fill="' + scoreColor + '">' + String(score) + '</text>' +
    '<text x="80" y="130" font-family="monospace" font-size="11" fill="#475569">/100</text>' +
    (entry && 'kani_verified' in entry && entry.kani_verified ? '<text x="330" y="130" font-family="monospace" font-size="11" fill="#22c55e">KANI \u2713</text>' : '') +
    '<text x="24" y="150" font-family="monospace" font-size="9" fill="#334155">' + safeSkillIdPrefix + '...</text>' +
    '</svg>'
  );
});

const registerRouteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/api/skills/register', registerRouteLimiter, async (req: Request, res: Response) => {
  const { slug, name, kind, authority, metadata_uri, component_path, kani_verified } = req.body ?? {};

  if (!slug || !authority) {
    res.status(400).json({ error: 'slug and authority are required' });
    return;
  }

  const authorityHeader = req.headers['x-authority-pubkey'] as string | undefined;
  if (authorityHeader && authorityHeader !== authority) {
    res.status(401).json({ error: 'authority mismatch' });
    return;
  }
  const signature = req.headers['x-signature'] as string | undefined;
  if (!verifyAuthoritySignature(authority, signature, req.body)) {
    res.status(401).json({ error: 'valid X-Signature required' });
    return;
  }

  try {
    const result = await registerSkill({
      slug,
      name: name ?? slug,
      kind: (kind ?? 'skill') as ComponentKind,
      authority,
      metadata_uri,
      component_path,
      kani_verified: kani_verified === true,
    });

    res.status(201).json({
      skill_id: result.skill_id,
      stride_score: result.verification.stride_score,
      kani_verified: result.entry.kani_verified,
      entry: result.entry,
      message: 'Registered. Submit skill_id on-chain via register_skill instruction.',
    });
  } catch (err: unknown) {
    const e = err as Error;
    res.status(422).json({ error: e.message });
  }
});

router.post('/api/skills/revoke/:skillId([0-9a-f]{64})', (req: Request, res: Response) => {
  const authority = (req.headers['x-authority-pubkey'] as string) ?? req.body?.authority;
  if (!authority) {
    res.status(401).json({ error: 'X-Authority-Pubkey header required' });
    return;
  }
  const signature = req.headers['x-signature'] as string | undefined;
  if (!verifyAuthoritySignature(authority, signature, req.body ?? { skillId: req.params.skillId })) {
    res.status(401).json({ error: 'valid X-Signature required' });
    return;
  }

  try {
    const skillId = firstParam(req.params.skillId);
    revokeSkill(skillId, authority);
    res.json({ revoked: true, skill_id: skillId });
  } catch (err: unknown) {
    const e = err as Error;
    res.status(403).json({ error: e.message });
  }
});

export default router;
