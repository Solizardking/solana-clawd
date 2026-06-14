import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadBrowserAgents } from './browserAgents';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface TemplateVariable {
  name: string;
  description: string;
  example?: string;
  required?: boolean;
}

export interface AgentTemplate {
  templateId: string;
  templateName: string;
  templateDescription: string;
  templateCategory: string;
  templateAvatar: string;
  variables: TemplateVariable[];
  agent: {
    author?: string;
    config: {
      systemRole: string;
      openingMessage: string;
      openingQuestions: string[];
    };
    schemaVersion?: number;
    meta: {
      title: string;
      description: string;
      avatar: string;
      tags: string[];
      category: string;
    };
  };
  [k: string]: unknown;
}

let cache: AgentTemplate[] | null = null;

function toTemplateVariable(input: any): TemplateVariable | null {
  if (!input || typeof input.name !== 'string' || typeof input.description !== 'string') return null;
  return {
    name: input.name,
    description: input.description,
    example: typeof input.example === 'string' ? input.example : undefined,
    required: Boolean(input.required),
  };
}

function adaptBrowserTemplate(id: string, raw: Record<string, any>): AgentTemplate | null {
  if (raw?.templateId && Array.isArray(raw?.variables) && raw?.agent?.config?.systemRole) {
    return {
      templateId: String(raw.templateId),
      templateName: String(raw.templateName ?? raw.templateId),
      templateDescription: String(raw.templateDescription ?? ''),
      templateCategory: String(raw.templateCategory ?? raw.agent?.meta?.category ?? 'general'),
      templateAvatar: String(raw.templateAvatar ?? raw.agent?.meta?.avatar ?? '🤖'),
      variables: raw.variables.map(toTemplateVariable).filter(Boolean) as TemplateVariable[],
      agent: raw.agent,
    };
  }

  const config = raw?.agent?.config ?? raw?.config;
  const systemRole = typeof config?.systemRole === 'string' ? config.systemRole : '';
  if (!systemRole) return null;

  const persona = raw?.persona ?? {};
  const meta = raw?.agent?.meta ?? raw?.meta ?? raw?.metadata ?? {};
  const displayName = raw?.displayName ?? raw?.templateName ?? raw?.name ?? id;
  const greeting = config?.openingMessage ?? persona?.greeting ?? '';
  const avatar = persona?.avatar ?? meta?.avatar ?? '🤖';
  const description = raw?.templateDescription ?? raw?.description ?? meta?.description ?? '';
  const category = meta?.category ?? raw?.templateCategory ?? 'general';
  const tags = Array.isArray(meta?.tags) ? meta.tags.filter(Boolean) : [];

  return {
    templateId: id,
    templateName: String(displayName),
    templateDescription: String(description),
    templateCategory: String(category),
    templateAvatar: String(avatar),
    variables: [],
    agent: {
      author: typeof raw?.author === 'string' ? raw.author : undefined,
      config: {
        systemRole,
        openingMessage: String(greeting),
        openingQuestions: Array.isArray(config?.openingQuestions) ? config.openingQuestions.filter(Boolean) : [],
      },
      schemaVersion: typeof raw?.schemaVersion === 'number' ? raw.schemaVersion : undefined,
      meta: {
        title: String(displayName),
        description: String(description),
        avatar: String(avatar),
        tags,
        category: String(category),
      },
    },
  };
}

export function loadTemplates(): AgentTemplate[] {
  if (cache) return cache;
  const dir = path.join(__dirname, 'agent-templates');
  const out: AgentTemplate[] = [];
  if (!fs.existsSync(dir)) {
    cache = out;
    return out;
  }
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    try {
      const raw = fs.readFileSync(path.join(dir, file), 'utf8');
      const t = JSON.parse(raw) as AgentTemplate;
      if (t.templateId) out.push(t);
    } catch (e) {
      console.warn('[clawd-templates] failed to load', file, e);
    }
  }
  const browser = loadBrowserAgents();
  const existingIds = new Set(out.map((template) => template.templateId));
  const imported = [...browser.browserTemplates, ...browser.templates]
    .map((template) => adaptBrowserTemplate(template.id, template.raw))
    .filter((template): template is AgentTemplate => Boolean(template))
    .filter((template) => !existingIds.has(template.templateId));
  out.push(...imported);
  cache = out;
  return out;
}

export function getTemplate(id: string): AgentTemplate | null {
  return loadTemplates().find((t) => t.templateId === id) ?? null;
}

const RESERVED_DEFAULTS: Record<string, string> = {
  USER_HANDLE: 'anonymous',
};

function interpolate(s: string, vars: Record<string, string>): string {
  return s.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => {
    if (key in vars) return vars[key];
    if (key in RESERVED_DEFAULTS) return RESERVED_DEFAULTS[key];
    return '';
  });
}

function interpolateDeep<T>(value: T, vars: Record<string, string>): T {
  if (typeof value === 'string') return interpolate(value, vars) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => interpolateDeep(v, vars)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = interpolateDeep(v, vars);
    return out as T;
  }
  return value;
}

export interface RenderResult {
  templateId: string;
  values: Record<string, string>;
  rendered: AgentTemplate['agent'];
  /** A flat shape ready to POST to /api/user-agents */
  deployable: {
    name: string;
    persona: string;
    greeting: string;
    avatarEmoji: string;
    tags: string[];
    category: string;
    openingQuestions: string[];
    suggestedSlug: string;
  };
  errors: string[];
}

function slugify(s: string, fallback = 'agent'): string {
  const cleaned = s
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return (cleaned || fallback).slice(0, 32);
}

export function renderTemplate(
  template: AgentTemplate,
  rawValues: Record<string, string>,
  ctx: { userHandle?: string } = {},
): RenderResult {
  const errors: string[] = [];
  const values: Record<string, string> = {};

  for (const v of template.variables) {
    const supplied = rawValues[v.name];
    const trimmed = typeof supplied === 'string' ? supplied.trim() : '';
    if (!trimmed) {
      if (v.required) errors.push(`Missing required variable: ${v.name}`);
      values[v.name] = '';
    } else {
      values[v.name] = trimmed;
    }
  }

  if (ctx.userHandle) values.USER_HANDLE = ctx.userHandle;

  // Trading-agent has an optional OPENING_MESSAGE — fall back to a default if empty.
  if ('OPENING_MESSAGE' in values && !values.OPENING_MESSAGE) {
    const title = values.AGENT_TITLE || template.templateName;
    values.OPENING_MESSAGE = `${template.templateAvatar} ${title} online. What can I help you with?`;
  }

  const rendered = interpolateDeep(template.agent, values);

  const name = (rendered.meta?.title || template.templateName).slice(0, 64);
  const persona = (rendered.config?.systemRole || '').slice(0, 4000);
  const greeting = (rendered.config?.openingMessage || '').slice(0, 500);
  const avatarEmoji = rendered.meta?.avatar || template.templateAvatar;
  const tags = Array.isArray(rendered.meta?.tags) ? rendered.meta!.tags.filter(Boolean) : [];
  const category = rendered.meta?.category || template.templateCategory;
  const openingQuestions = Array.isArray(rendered.config?.openingQuestions)
    ? rendered.config!.openingQuestions.filter(Boolean)
    : [];
  const suggestedSlug = slugify(`${template.templateId}_${values.AGENT_TITLE || ''}`);

  return {
    templateId: template.templateId,
    values,
    rendered,
    deployable: {
      name,
      persona,
      greeting,
      avatarEmoji,
      tags,
      category,
      openingQuestions,
      suggestedSlug,
    },
    errors,
  };
}
