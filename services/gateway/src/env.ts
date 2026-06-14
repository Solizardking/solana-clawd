import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

const candidateDirs = [
  process.cwd(),
  path.resolve(process.cwd(), '..'),
  path.resolve(moduleDir, '..', '..'),
  path.resolve(moduleDir, '..', '..', '..'),
];

const seen = new Set<string>();

for (const dir of candidateDirs) {
  for (const name of ['.env.local', '.env']) {
    const file = path.join(dir, name);
    if (seen.has(file) || !fs.existsSync(file)) continue;
    dotenv.config({ path: file, override: false });
    seen.add(file);
  }
}
