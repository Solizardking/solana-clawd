import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DEFAULT_ORE_CLI_PATH, DEFAULT_ORE_ROOT } from './constants.js';
import { ensureKeypairPath } from './keypair.js';

const execFileAsync = promisify(execFile);

export interface CliResult {
  success: boolean;
  stdout: string;
  stderr: string;
}

export function resolveOreCliPath(): string {
  if (process.env.ORE_CLI_PATH) {
    return process.env.ORE_CLI_PATH;
  }
  const oreRoot = process.env.ORE_ROOT ?? DEFAULT_ORE_ROOT;
  return `${oreRoot}/target/release/ore-cli`;
}

export function isOreCliAvailable(): boolean {
  return existsSync(resolveOreCliPath());
}

export async function runOreCli(command: string, extraEnv: Record<string, string> = {}): Promise<CliResult> {
  const cliPath = resolveOreCliPath();
  if (!existsSync(cliPath)) {
    return {
      success: false,
      stdout: '',
      stderr: [
        `ore-cli not found at ${cliPath}`,
        `expected root: ${process.env.ORE_ROOT ?? DEFAULT_ORE_ROOT}`,
      ].join('\n'),
    };
  }

  const rpc = process.env.RPC ?? process.env.HELIUS_RPC_URL;
  const keypair = ensureKeypairPath({
    keypairPath: process.env.KEYPAIR,
    keypairBase58: process.env.KEYPAIR_BASE58,
  });
  if (!rpc || !keypair) {
    return {
      success: false,
      stdout: '',
      stderr: 'RPC and KEYPAIR or KEYPAIR_BASE58 env vars are required',
    };
  }

  try {
    const { stdout, stderr } = await execFileAsync(cliPath, [], {
      env: {
        ...process.env,
        COMMAND: command,
        RPC: rpc,
        KEYPAIR: keypair,
        ...extraEnv,
      },
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    });

    return { success: true, stdout, stderr };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return {
      success: false,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? err.message ?? String(error),
    };
  }
}

export async function deployToSquares(totalLamports: bigint, squares: number[]): Promise<CliResult> {
  if (squares.length === 0) {
    return { success: false, stdout: '', stderr: 'No squares selected' };
  }

  const base = totalLamports / BigInt(squares.length);
  const remainder = totalLamports % BigInt(squares.length);
  const stdout: string[] = [];
  const stderr: string[] = [];

  for (let i = 0; i < squares.length; i += 1) {
    const lamports = base + (i === 0 ? remainder : 0n);
    const result = await runOreCli('deploy', {
      AMOUNT: lamports.toString(),
      SQUARE: String(squares[i]),
    });
    stdout.push(`square ${squares[i]}:\n${result.stdout}`.trim());
    if (result.stderr) {
      stderr.push(`square ${squares[i]}:\n${result.stderr}`.trim());
    }
    if (!result.success) {
      return {
        success: false,
        stdout: stdout.join('\n\n'),
        stderr: stderr.join('\n\n'),
      };
    }
  }

  return {
    success: true,
    stdout: stdout.join('\n\n'),
    stderr: stderr.join('\n\n'),
  };
}

export async function checkpointMiner(): Promise<CliResult> {
  return runOreCli('checkpoint');
}

export async function claimRewards(): Promise<CliResult> {
  return runOreCli('claim');
}
