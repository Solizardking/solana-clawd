import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NextResponse } from 'next/server';

const execFileAsync = promisify(execFile);
const VULCAN_BIN = process.env.VULCAN_BIN ?? 'vulcan';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get('symbol') ?? 'SOL').toUpperCase();

  try {
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (process.env.VULCAN_WALLET_NAME) env.VULCAN_WALLET_NAME = process.env.VULCAN_WALLET_NAME;

    const { stdout } = await execFileAsync(VULCAN_BIN, ['market', 'ticker', symbol, '-o', 'json'], {
      env,
      timeout: 15_000,
    });
    const parsed = JSON.parse(stdout) as unknown;
    return NextResponse.json({ ok: true, symbol, data: parsed });
  } catch (err) {
    return NextResponse.json({ ok: false, symbol, error: String(err) }, { status: 503 });
  }
}
