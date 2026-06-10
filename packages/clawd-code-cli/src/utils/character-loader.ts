import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Schema types ────────────────────────────────────────────────────────────

/** Eliza-style character (Alice, Cheshire, Clawd, Mad Hatter, …) */
export interface ElizaCharacter {
  name: string;
  bio?: string[];
  lore?: string[];
  adjectives?: string[];
  topics?: string[];
  style?: {
    all?: string[];
    chat?: string[];
    post?: string[];
  };
  messageExamples?: Array<Array<{ user: string; content: { text: string; action?: string } }>>;
  postExamples?: string[];
}

/** Investor-style character (Warren Buffett, Ben Graham, Charlie Munger, …) */
export interface InvestorCharacter {
  name: string;
  role?: string;
  version?: string;
  description?: string;
  personality_traits?: Record<string, string>;
  investment_principles?: Record<string, string>;
  analysis_methods?: Record<string, unknown>;
  valuation_framework?: Record<string, string>;
  key_metrics?: string[];
  communication_style?: {
    tone?: string;
    emphasis?: string;
    examples?: string;
    citations?: string;
    signature_phrases?: string[];
  };
  historical_context?: Record<string, unknown>;
  focus_sectors?: string[];
  mental_models?: string[];
}

/** Solana-agent style (solana-*.json files) */
export interface SolanaAgentCharacter {
  name: string;
  role?: string;
  description?: string;
  version?: string;
  personality?: Record<string, string | string[]>;
  capabilities?: string[];
  tools?: string[];
  communication_style?: Record<string, string | string[]>;
  [key: string]: unknown;
}

export type AnyCharacter = ElizaCharacter | InvestorCharacter | SolanaAgentCharacter;
type CharacterType = 'eliza' | 'investor' | 'solana-agent';

// ── Character index entry ───────────────────────────────────────────────────

export interface CharacterEntry {
  id: string;          // slug derived from filename, e.g. "warrenbuffet"
  displayName: string; // from character's name field
  file: string;        // absolute path to JSON file
  type: 'eliza' | 'investor' | 'solana-agent';
  description?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Resolve the characters/ directory relative to the repo root or process.cwd() */
export function resolveCharactersDir(): string {
  const candidates = [
    // When running from the monorepo root
    path.join(process.cwd(), 'characters'),
    // When running from packages/clawd
    path.join(process.cwd(), '..', '..', 'characters'),
    // Absolute fallback based on this file's location (dist tree)
    path.join(__dirname, '..', '..', '..', '..', 'characters'),
    path.join(__dirname, '..', '..', '..', '..', '..', 'characters'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isDirectory()) return c;
  }
  // Last resort: search upward from cwd
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'characters');
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.join(process.cwd(), 'characters');
}

function detectType(raw: unknown): CharacterType {
  if (!raw || typeof raw !== 'object') return 'eliza';
  const obj = raw as Record<string, unknown>;
  if ('persona' in obj) return 'solana-agent';
  if ('bio' in obj || 'lore' in obj || 'messageExamples' in obj) return 'eliza';
  if ('investment_principles' in obj || 'valuation_framework' in obj || 'key_metrics' in obj) return 'investor';
  return 'solana-agent';
}

function normalizeCharacter(raw: unknown): { data: AnyCharacter; type: CharacterType } | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  if ('persona' in obj && obj.persona && typeof obj.persona === 'object') {
    const persona = obj.persona as Record<string, unknown>;
    const traits = Array.isArray(persona.traits) ? persona.traits.map(String) : [];
    const beliefs = Array.isArray(obj.beliefs) ? obj.beliefs.map(String) : [];
    const signaturePhrases = Array.isArray(obj.signature_phrases)
      ? obj.signature_phrases.map(String)
      : [];
    const normalized: SolanaAgentCharacter = {
      name: String(persona.name ?? 'Unknown Character'),
      role: typeof persona.role === 'string' ? persona.role : undefined,
      description: Array.isArray(obj.bio)
        ? obj.bio.map(String).join(' ')
        : typeof persona.core_quote === 'string'
          ? persona.core_quote
          : undefined,
      personality: {
        greeting: typeof persona.greeting === 'string' ? persona.greeting : '',
        core_quote: typeof persona.core_quote === 'string' ? persona.core_quote : '',
        traits: traits.join(', '),
        beliefs: beliefs.join(' | '),
      },
      communication_style:
        obj.communication_style && typeof obj.communication_style === 'object'
          ? (obj.communication_style as Record<string, string | string[]>)
          : undefined,
      capabilities: signaturePhrases,
      avatar: persona.avatar,
      beliefs,
      lobster_lexicon: obj.lobster_lexicon,
      signature_phrases: signaturePhrases,
    };
    return { data: normalized, type: 'solana-agent' };
  }

  return { data: raw as AnyCharacter, type: detectType(raw) };
}

function slugify(filename: string): string {
  return path.basename(filename, '.json')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-');
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Scan the characters/ directory and return a flat list of all available characters.
 * Array-valued JSON files (hedgefund.json) are expanded into individual entries.
 */
export function listCharacters(charactersDir?: string): CharacterEntry[] {
  const dir = charactersDir ?? resolveCharactersDir();
  if (!fs.existsSync(dir)) return [];

  const entries: CharacterEntry[] = [];

  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    const filePath = path.join(dir, file);
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const items: unknown[] = Array.isArray(raw) ? raw : [raw];
      for (const item of items) {
        const normalized = normalizeCharacter(item);
        if (!normalized) continue;
        const obj = normalized.data as Record<string, unknown>;
        const name = (obj.name as string | undefined) ?? path.basename(file, '.json');
        const type = normalized.type;
        const description =
          (obj.description as string | undefined) ??
          (Array.isArray(obj.bio) ? (obj.bio as string[])[0] : undefined);
        // For array files, derive ID as slug-of-name so each investor gets its own ID
        const id = Array.isArray(raw)
          ? name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
          : slugify(file);
        entries.push({ id, displayName: name, file: filePath, type, description });
      }
    } catch {
      // Skip malformed files silently
    }
  }

  return entries.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Load a single character by name or slug.
 * Returns the raw character data object and the detected type.
 * For array files (hedgefund.json) the matching entry is extracted.
 */
export function loadCharacter(
  nameOrSlug: string,
  charactersDir?: string
): { data: AnyCharacter; type: CharacterType } | null {
  const dir = charactersDir ?? resolveCharactersDir();
  const query = nameOrSlug.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    const fileSlug = slugify(file);
    const filePath = path.join(dir, file);
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const items: unknown[] = Array.isArray(raw) ? raw : [raw];
      for (const item of items) {
        const normalized = normalizeCharacter(item);
        if (!normalized) continue;
        const obj = normalized.data as Record<string, unknown>;
        const nameField = (obj.name as string | undefined) ?? '';
        const nameSlug = nameField.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const slugMatches =
          nameSlug.length > 0 && (
            nameSlug === query ||
            nameSlug.includes(query) ||
            query.includes(nameSlug)
          );
        if (
          fileSlug === query ||
          slugMatches
        ) {
          return normalized;
        }
      }
    } catch {
      // Skip malformed files
    }
  }
  return null;
}

// ── System-prompt builder ────────────────────────────────────────────────────

function buildElizaPrompt(c: ElizaCharacter): string {
  const parts: string[] = [`You are ${c.name}.`];

  if (c.bio?.length) {
    parts.push('\nBIO:\n' + c.bio.map(b => `- ${b}`).join('\n'));
  }
  if (c.lore?.length) {
    parts.push('\nLORE:\n' + c.lore.map(l => `- ${l}`).join('\n'));
  }
  if (c.adjectives?.length) {
    parts.push(`\nADJECTIVES: ${c.adjectives.join(', ')}`);
  }
  if (c.topics?.length) {
    parts.push('\nCORE TOPICS: ' + c.topics.join(', '));
  }
  if (c.style) {
    const styleLines: string[] = [];
    if (c.style.all?.length) styleLines.push('General: ' + c.style.all.join(' '));
    if (c.style.chat?.length) styleLines.push('Chat: ' + c.style.chat.join(' '));
    if (c.style.post?.length) styleLines.push('Post: ' + c.style.post.join(' '));
    if (styleLines.length) parts.push('\nSTYLE GUIDELINES:\n' + styleLines.join('\n'));
  }
  if (c.messageExamples?.length) {
    const examples = c.messageExamples.slice(0, 2).map(thread =>
      thread.map(m => `${m.user}: ${m.content.text}`).join('\n')
    ).join('\n\n');
    parts.push(`\nEXAMPLE EXCHANGES:\n${examples}`);
  }
  return parts.join('');
}

function buildInvestorPrompt(c: InvestorCharacter): string {
  const role = c.role ? ` (${c.role})` : '';
  const parts: string[] = [`You are ${c.name}${role}.`];

  if (c.description) parts.push(`\n${c.description}`);

  if (c.personality_traits) {
    const traits = Object.entries(c.personality_traits)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join('\n');
    parts.push(`\nPERSONALITY:\n${traits}`);
  }
  if (c.investment_principles) {
    const principles = Object.entries(c.investment_principles)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join('\n');
    parts.push(`\nINVESTMENT PRINCIPLES:\n${principles}`);
  }
  if (c.key_metrics?.length) {
    parts.push(`\nKEY METRICS: ${c.key_metrics.join(', ')}`);
  }
  if (c.communication_style) {
    const cs = c.communication_style;
    const lines: string[] = [];
    if (cs.tone) lines.push(`Tone: ${cs.tone}`);
    if (cs.emphasis) lines.push(`Emphasis: ${cs.emphasis}`);
    if (cs.signature_phrases?.length) {
      lines.push(`Signature phrases: "${cs.signature_phrases.join('", "')}"`);
    }
    if (lines.length) parts.push(`\nCOMMUNICATION STYLE:\n${lines.join('\n')}`);
  }
  return parts.join('');
}

function buildSolanaAgentPrompt(c: SolanaAgentCharacter): string {
  const role = c.role ? ` — ${c.role}` : '';
  const parts: string[] = [`You are ${c.name}${role}.`];

  if (c.description) parts.push(`\n${c.description}`);

  if (Array.isArray(c.capabilities) && c.capabilities.length) {
    parts.push(`\nCAPABILITIES:\n${(c.capabilities as string[]).map(cap => `- ${cap}`).join('\n')}`);
  }
  if (c.personality && typeof c.personality === 'object') {
    const lines = Object.entries(c.personality as Record<string, string>)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join('\n');
    parts.push(`\nPERSONALITY:\n${lines}`);
  }
  if (c.communication_style && typeof c.communication_style === 'object') {
    const lines = Object.entries(c.communication_style as Record<string, string>)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join('\n');
    parts.push(`\nCOMMUNICATION STYLE:\n${lines}`);
  }
  return parts.join('');
}

/**
 * Build a system-prompt persona section from any character type.
 * Returns a string ready to be prepended to (or injected into) the system message.
 */
export function buildCharacterPrompt(
  data: AnyCharacter,
  type: 'eliza' | 'investor' | 'solana-agent'
): string {
  switch (type) {
    case 'eliza':    return buildElizaPrompt(data as ElizaCharacter);
    case 'investor': return buildInvestorPrompt(data as InvestorCharacter);
    default:         return buildSolanaAgentPrompt(data as SolanaAgentCharacter);
  }
}
