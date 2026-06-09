#!/usr/bin/env node
/**
 * 🦞 Library Server — serve public/library/ on a local port for testing
 *
 * Run with:  node scripts/serve-library.mjs [port]
 * Default port: 4173
 *
 * Serves the synced library catalog exactly as it would be served from
 * https://x402.wtf/library/ via the production Vite build.
 */

import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT       = resolve(__dirname, '..');
const SERVE_DIR  = join(ROOT, 'public', 'library');
const PORT       = Number(process.argv[2] || process.env.LIBRARY_PORT || 4173);

if (!existsSync(SERVE_DIR)) {
  console.error(`✗ ${SERVE_DIR} not found — run \`npm run library:build\` first`);
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.txt':  'text/plain; charset=utf-8',
  '.md':   'text/markdown; charset=utf-8',
  '.xml':  'application/xml; charset=utf-8',
  '.yml':  'text/yaml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
};

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let filePath = join(SERVE_DIR, url === '/' ? '/index.html' : url);

  // Security: prevent path traversal
  if (!filePath.startsWith(SERVE_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  // Directory → index.html
  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, 'index.html');
  }
  if (!existsSync(filePath)) {
    // SPA fallback: serve /index.html for any unknown path under /library
    const fallback = join(SERVE_DIR, 'index.html');
    if (existsSync(fallback) && req.headers.accept?.includes('text/html')) {
      res.writeHead(200, { 'content-type': MIME['.html'] });
      res.end(readFileSync(fallback));
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end(`404 — ${url} not found`);
    console.log(`  404 ${url}`);
    return;
  }

  const ext = extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'content-type': type,
    'cache-control': 'no-cache',
    'access-control-allow-origin': '*',
  });
  res.end(readFileSync(filePath));
  console.log(`  200 ${url}`);
});

server.listen(PORT, () => {
  console.log(`\n🦞 Library serving from ${SERVE_DIR}`);
  console.log(`   http://localhost:${PORT}/`);
  console.log(`   http://localhost:${PORT}/index.json\n`);
  console.log('Press Ctrl+C to stop.\n');
});
