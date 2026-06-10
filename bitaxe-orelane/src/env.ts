import { existsSync, readFileSync } from 'node:fs';
import { DEFAULT_ORE_ROOT } from './constants.js';

function oreEnvPath(): string {
  return `${process.env.ORE_ROOT ?? DEFAULT_ORE_ROOT}/ore-miner/.env`;
}

export const DEFAULT_ENV_FILES = ['.env'];

function unquote(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function loadEnvFiles(paths?: string[]): string[] {
  const filesToLoad = paths ?? [...DEFAULT_ENV_FILES, oreEnvPath()];
  const loaded: string[] = [];

  for (const path of filesToLoad) {
    if (!existsSync(path)) {
      continue;
    }

    const contents = readFileSync(path, 'utf-8');
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }

      const normalized = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
      const separator = normalized.indexOf('=');
      if (separator <= 0) {
        continue;
      }

      const key = normalized.slice(0, separator).trim();
      const value = unquote(normalized.slice(separator + 1));
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }

    loaded.push(path);
  }

  return loaded;
}

