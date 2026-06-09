import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NextResponse } from 'next/server';

const execFileAsync = promisify(execFile);
const VULCAN_BIN = process.env.VULCAN_BIN ?? 'vulcan';

export async function GET() {
  try {
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (process.env.VULCAN_WALLET_NAME) env.VULCAN_WALLET_NAME = process.env.VULCAN_WALLET_NAME;
    if (process.env.VULCAN_WALLET_PASSWORD) env.VULCAN_WALLET_PASSWORD = process.env.VULCAN_WALLET_PASSWORD;

    const { stdout } = await execFileAsync(VULCAN_BIN, ['portfolio', '-o', 'json'], {
      env,
      timeout: 20_000,
    });
    const parsed = JSON.parse(stdout) as unknown;
    return NextResponse.json({ ok: true, data: parsed });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 503 });
  }
}
