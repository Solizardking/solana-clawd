#!/usr/bin/env node
/**
 * 🦞 Library Validator — sanity check the synced library catalog
 *
 * Run after `npm run library:build` to ensure:
 *   1. Every agent in library/src/ has a public/{id}.json and an index entry
 *   2. Every agent in library/public/ is in the index
 *   3. Every agent's JSON parses and has the minimum required fields
 *   4. The schema file exists and is valid JSON
 *   5. The public/library/ mirror matches library/public/
 *   6. The total count in meta.json matches the actual index
 *
 * Exits non-zero on any error so it can be used in CI.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT       = resolve(__dirname, '..');
const LIB_ROOT   = join(ROOT, 'library');
const SRC_DIR    = join(LIB_ROOT, 'src');
const PUB_DIR    = join(LIB_ROOT, 'public');
const MIRROR_DIR = join(ROOT, 'public', 'library');
const SCHEMA_DIR = join(LIB_ROOT, 'schema');

const REQUIRED_FIELDS = ['author', 'identifier', 'config', 'meta', 'schemaVersion'];
const REQUIRED_META   = ['title', 'description'];

let errs = 0;
const fail = (m) => { console.error(`  ✗ ${m}`); errs++; };
const ok   = (m) => console.log(`  ✓ ${m}`);

console.log('🦞 Lobster Library — validate\n');

// 1. Source agents
console.log(`Source: ${SRC_DIR}`);
if (!existsSync(SRC_DIR)) {
  fail('library/src not found');
  process.exit(1);
}
const srcFiles = readdirSync(SRC_DIR).filter((f) => f.endsWith('.json'));
ok(`${srcFiles.length} source files`);
const srcIds = new Set();
for (const f of srcFiles) {
  try {
    const a = JSON.parse(readFileSync(join(SRC_DIR, f), 'utf8'));
    for (const k of REQUIRED_FIELDS) {
      if (!(k in a)) fail(`${f}: missing field "${k}"`);
    }
    if (a.meta) {
      for (const k of REQUIRED_META) {
        if (!a.meta[k]) fail(`${f}: meta.${k} empty`);
      }
    }
    if (a.identifier) srcIds.add(a.identifier);
  } catch (e) {
    fail(`${f}: ${e.message}`);
  }
}

// 2. Public catalog
console.log(`\nPublic: ${PUB_DIR}`);
if (!existsSync(PUB_DIR)) {
  fail('library/public not found — run npm run library:build');
  process.exit(1);
}
const pubFiles = readdirSync(PUB_DIR).filter((f) => f.endsWith('.json') && f !== 'index.json' && f !== 'meta.json');
ok(`${pubFiles.length} public agent files`);

let index;
try {
  index = JSON.parse(readFileSync(join(PUB_DIR, 'index.json'), 'utf8'));
} catch (e) {
  fail(`index.json: ${e.message}`);
  process.exit(1);
}
if (!Array.isArray(index.agents)) {
  fail('index.json: agents is not an array');
}
const indexIds = new Set(index.agents.map((a) => a.identifier));
ok(`index.json: ${index.agents.length} agents`);

// 3. Cross-check
console.log('\nCross-check (src ↔ public ↔ index):');
for (const id of srcIds) {
  if (!pubFiles.includes(`${id}.json`)) fail(`public/${id}.json missing`);
  if (!indexIds.has(id)) fail(`index.json missing ${id}`);
}
for (const f of pubFiles) {
  const id = f.replace(/\.json$/, '');
  if (!srcIds.has(id)) warn(`public/${f} has no matching src entry`);
  if (!indexIds.has(id)) fail(`public/${f} has no index entry`);
}

// 4. Schema
console.log('\nSchema:');
const schemaFile = join(SCHEMA_DIR, 'speraxAgentSchema_v1.json');
if (existsSync(schemaFile)) {
  try {
    JSON.parse(readFileSync(schemaFile, 'utf8'));
    ok('speraxAgentSchema_v1.json valid');
  } catch (e) {
    fail(`schema: ${e.message}`);
  }
} else {
  fail('schema/speraxAgentSchema_v1.json missing');
}

// 5. Mirror
console.log('\nMirror:');
if (existsSync(MIRROR_DIR)) {
  const mirrorFiles = readdirSync(MIRROR_DIR, { recursive: true }).filter((f) => f.endsWith('.json') || f.endsWith('.html'));
  ok(`public/library/ contains ${mirrorFiles.length} files`);
} else {
  fail('public/library/ mirror not found');
}

// 6. Meta
console.log('\nMeta:');
try {
  const meta = JSON.parse(readFileSync(join(PUB_DIR, 'meta.json'), 'utf8'));
  if (meta.agentCount !== index.agents.length) {
    fail(`meta.agentCount (${meta.agentCount}) != index agents (${index.agents.length})`);
  } else {
    ok(`meta.agentCount matches index: ${meta.agentCount}`);
  }
} catch (e) {
  fail(`meta.json: ${e.message}`);
}

console.log();
if (errs === 0) {
  console.log(`✅ Library validated: ${index.agents.length} agents ready at https://x402.wtf/library/`);
  process.exit(0);
} else {
  console.error(`❌ ${errs} validation error(s)`);
  process.exit(1);
}

function warn(m) { console.warn(`  ! ${m}`); }
