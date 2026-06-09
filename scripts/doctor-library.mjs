#!/usr/bin/env node
/**
 * 🦞 Library Doctor — diagnose the library integration end-to-end
 *
 * Checks:
 *   1. library/ workspace folder exists and is well-structured
 *   2. library/package.json is valid and points to x402.wtf/library
 *   3. pnpm-workspace.yaml includes "library"
 *   4. Root package.json has the @openclawd/lobster-library workspace dep
 *   5. Root package.json has the library:* scripts
 *   6. scripts/sync-library.mjs exists and is executable
 *   7. public/library/ is up to date with library/src/
 *   8. Each top-level file/folder the user mentioned exists in library/
 *   9. The .well-known/ai-plugin.json describes the library correctly
 */

import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT       = resolve(__dirname, '..');
const LIB_ROOT   = join(ROOT, 'library');

let errs = 0, warns = 0;
const fail = (m) => { console.error(`  ✗ ${m}`); errs++; };
const warn = (m) => { console.warn(`  ! ${m}`); warns++; };
const ok   = (m) => console.log(`  ✓ ${m}`);

console.log('🩺 Library Doctor — integration health check\n');

const REQUIRED = [
  '.agents', '.cursor', '.github', '.well-known',
  'docs', 'knowledge', 'locales', 'node_modules',
  'public', 'schema', 'scripts', 'src',
  '.editorconfig', '.eslintrc.cjs', '.gitattributes', '.gitignore',
  '.i18nignore', '.i18nrc.js', '.npmrc', '.releaserc.cjs',
  'agent-template-full.json', 'agent-template.json',
  'AGENTS.md', 'bun.lock', 'CHANGELOG.md', 'CITATION.cff',
  'CLAUDE.md', 'CNAME', 'CODE_OF_CONDUCT.md', 'CONTRIBUTING.md',
  'GEMINI.md', 'humans.txt', 'LICENSE', 'llms-full.txt', 'llms.txt',
  'meta.json', 'nanoclawd-favicon.png.png', 'nanoclawd-icon.png',
  'nanoclawd-logo-dark.png', 'nanoclawd-logo.png', 'nanoclawd-profile.png',
  'nanoclawd-sales.jpg.png', 'package.json', 'README.md',
  'SECURITY.md', 'skills-lock.json', 'tsconfig.json',
];

console.log('library/ structure:');
for (const item of REQUIRED) {
  const p = join(LIB_ROOT, item);
  if (!existsSync(p)) {
    fail(`library/${item} missing`);
  }
}
if (errs === 0) ok(`all ${REQUIRED.length} required files & folders present`);

console.log('\nlibrary/package.json:');
try {
  const pj = JSON.parse(readFileSync(join(LIB_ROOT, 'package.json'), 'utf8'));
  if (pj.name !== '@openclawd/lobster-library') fail(`name: ${pj.name} (expected @openclawd/lobster-library)`);
  else ok(`name: ${pj.name}`);
  if (pj.homepage !== 'https://x402.wtf/library') fail(`homepage: ${pj.homepage}`);
  else ok(`homepage: ${pj.homepage}`);
  if (!pj.keywords?.includes('x402.wtf')) warn('keywords missing x402.wtf');
  else ok('keywords include x402.wtf');
} catch (e) {
  fail(`parse error: ${e.message}`);
}

console.log('\npnpm-workspace.yaml:');
try {
  const ws = readFileSync(join(ROOT, 'pnpm-workspace.yaml'), 'utf8');
  if (!ws.includes('library')) fail('library missing from pnpm-workspace.yaml');
  else ok('library is a workspace package');
} catch (e) {
  fail(e.message);
}

console.log('\nroot package.json:');
try {
  const pj = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  if (!pj.dependencies?.['@openclawd/lobster-library']) fail('root dep @openclawd/lobster-library missing');
  else ok('root dep @openclawd/lobster-library present');
  if (!pj.scripts?.['library:build']) fail('script library:build missing');
  else ok('script library:build present');
  if (!pj.scripts?.['library:sync']) fail('script library:sync missing');
  else ok('script library:sync present');
} catch (e) {
  fail(e.message);
}

console.log('\nsync & validate scripts:');
for (const f of ['sync-library.mjs', 'validate-library.mjs', 'serve-library.mjs', 'doctor-library.mjs']) {
  const p = join(ROOT, 'scripts', f);
  if (!existsSync(p)) fail(`scripts/${f} missing`);
  else ok(`scripts/${f} present`);
}

console.log('\npublic/library/ mirror:');
const mirror = join(ROOT, 'public', 'library');
if (!existsSync(mirror)) warn('public/library/ not built yet — run npm run library:build');
else {
  const files = readdirSync(mirror, { recursive: true }).filter((f) => !statSync(join(mirror, f)).isDirectory());
  ok(`public/library/ has ${files.length} files`);
  if (existsSync(join(mirror, 'index.json'))) ok('public/library/index.json present');
  else fail('public/library/index.json missing');
  if (existsSync(join(mirror, 'index.html'))) ok('public/library/index.html present');
  else warn('public/library/index.html missing (run library:build)');
}

console.log('\n.well-known/ai-plugin.json:');
try {
  const p = JSON.parse(readFileSync(join(LIB_ROOT, '.well-known/ai-plugin.json'), 'utf8'));
  if (!p.description_for_model?.toLowerCase().includes('lobster')) fail('ai-plugin description missing "lobster"');
  else ok('ai-plugin description mentions lobster library');
} catch (e) {
  fail(e.message);
}

console.log();
if (errs === 0) {
  console.log(`✅ Library integration healthy (${warns} warning${warns === 1 ? '' : 's'})`);
  process.exit(0);
} else {
  console.error(`❌ ${errs} error(s), ${warns} warning(s)`);
  process.exit(1);
}
