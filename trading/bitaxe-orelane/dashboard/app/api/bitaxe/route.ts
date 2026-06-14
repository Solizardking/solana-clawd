import { NextResponse } from 'next/server';

const BITAXE_URL = process.env.BITAXE_URL ?? 'http://192.168.1.100';

export async function GET() {
  try {
    const res = await fetch(new URL('/api/system/info', BITAXE_URL).toString(), {
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 0 },
    });
    if (!res.ok) throw new Error(`AxeOS ${res.status}`);
    const data = await res.json();
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 503 });
  }
}
