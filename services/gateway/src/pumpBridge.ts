/**
 * gateway/src/pumpBridge.ts — Subprocess bridge to clawd-pump (Rust).
 *
 * Spawns `cargo run` (or a pre-built binary) with structured args and captures
 * stdout/stderr as a result.  Falls back to a dry-run message when the pump
 * directory is not present or cargo is unavailable.
 *
 * Env vars:
 *   PUMP_DIR        — path to clawd-pump directory (default: ../../clawd-pump)
 *   PUMP_BINARY     — path to pre-built binary (overrides cargo run)
 *   PUMP_DRY_RUN    — set to "true" to disable actual execution (returns mock)
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PUMP_DIR = process.env.PUMP_DIR
  ? resolve(process.env.PUMP_DIR)
  : resolve(__dirname, '..', '..', 'clawd-pump');

const PUMP_BINARY = process.env.PUMP_BINARY;
const DRY_RUN = process.env.PUMP_DRY_RUN === 'true';

export interface PumpResult {
  success: boolean;
  output: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Core runner
// ---------------------------------------------------------------------------

function runCommand(args: string[]): Promise<PumpResult> {
  return new Promise((resolve) => {
    const [cmd, cmdArgs] = PUMP_BINARY
      ? [PUMP_BINARY, args]
      : ['cargo', ['run', '--', ...args]];

    const cwd = PUMP_BINARY ? dirname(PUMP_BINARY) : PUMP_DIR;
    const proc = spawn(cmd, cmdArgs, {
      cwd,
      env: { ...process.env },
      timeout: 60_000,
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      resolve({
        success: code === 0,
        output: stdout.trim(),
        error: stderr.trim() || undefined,
      });
    });

    proc.on('error', (err) => {
      resolve({ success: false, output: '', error: err.message });
    });
  });
}

function isAvailable(): boolean {
  return existsSync(PUMP_DIR) || (!!PUMP_BINARY && existsSync(PUMP_BINARY!));
}

// ---------------------------------------------------------------------------
// Public trading actions
// ---------------------------------------------------------------------------

/** Buy a token via PumpFun protocol. */
export async function buy(mint: string, solAmount: number): Promise<PumpResult> {
  if (DRY_RUN) return { success: true, output: `[dry-run] buy ${solAmount} SOL of ${mint}` };
  if (!isAvailable()) return { success: false, output: '', error: 'clawd-pump not found' };
  return runCommand(['--buy', mint, String(solAmount)]);
}

/** Check SOL/WSOL balance and optionally rebalance. */
export async function balance(): Promise<PumpResult> {
  if (DRY_RUN) return { success: true, output: '[dry-run] balance check' };
  if (!isAvailable()) return { success: false, output: '', error: 'clawd-pump not found' };
  return runCommand(['--balance']);
}

/** Wrap SOL → WSOL. */
export async function wrapSol(amount?: number): Promise<PumpResult> {
  if (DRY_RUN) return { success: true, output: `[dry-run] wrap ${amount ?? 'default'} SOL` };
  if (!isAvailable()) return { success: false, output: '', error: 'clawd-pump not found' };
  const args = amount ? ['--wrap', String(amount)] : ['--wrap'];
  return runCommand(args);
}

/** Unwrap WSOL → SOL. */
export async function unwrapSol(): Promise<PumpResult> {
  if (DRY_RUN) return { success: true, output: '[dry-run] unwrap WSOL' };
  if (!isAvailable()) return { success: false, output: '', error: 'clawd-pump not found' };
  return runCommand(['--unwrap']);
}

/** Close empty token accounts to reclaim rent. */
export async function closeEmptyAccounts(): Promise<PumpResult> {
  if (DRY_RUN) return { success: true, output: '[dry-run] close empty accounts' };
  if (!isAvailable()) return { success: false, output: '', error: 'clawd-pump not found' };
  return runCommand(['--close']);
}

/** Check which tokens are currently tracked. */
export async function checkTokens(): Promise<PumpResult> {
  if (DRY_RUN) return { success: true, output: '[dry-run] check tokens' };
  if (!isAvailable()) return { success: false, output: '', error: 'clawd-pump not found' };
  return runCommand(['--check-tokens']);
}

/** Manual risk management check. */
export async function riskCheck(): Promise<PumpResult> {
  if (DRY_RUN) return { success: true, output: '[dry-run] risk check' };
  if (!isAvailable()) return { success: false, output: '', error: 'clawd-pump not found' };
  return runCommand(['--risk-check']);
}
