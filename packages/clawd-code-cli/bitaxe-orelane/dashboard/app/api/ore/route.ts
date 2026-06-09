import { NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';

const RPC = process.env.RPC ?? process.env.HELIUS_RPC_URL ?? '';
const ORE_PROGRAM_ID = new PublicKey('oreV3EG1i9BEgiAJ8b177Z2S2rMarzak4NMv1kULvWv');
const BOARD_SEED = Buffer.from('board');
const ROUND_SEED = Buffer.from('round');

function readU64LE(buf: Buffer, offset: number): bigint {
  return buf.readBigUInt64LE(offset);
}

function boardPda() {
  return PublicKey.findProgramAddressSync([BOARD_SEED], ORE_PROGRAM_ID);
}

function roundPda(roundId: bigint) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(roundId);
  return PublicKey.findProgramAddressSync([ROUND_SEED, buf], ORE_PROGRAM_ID);
}

export async function GET() {
  if (!RPC) return NextResponse.json({ ok: false, error: 'RPC not configured' }, { status: 503 });

  try {
    const conn = new Connection(RPC, 'confirmed');
    const [boardAddr] = boardPda();
    const [boardAccount, slotRaw] = await Promise.all([
      conn.getAccountInfo(boardAddr),
      conn.getSlot(),
    ]);

    if (!boardAccount) throw new Error('Board account not found');
    const boardBuf = Buffer.from(boardAccount.data);
    const roundId = readU64LE(boardBuf, 8);
    const endSlot = readU64LE(boardBuf, 24);
    const currentSlot = BigInt(slotRaw);

    const [roundAddr] = roundPda(roundId);
    const roundAccount = await conn.getAccountInfo(roundAddr);
    if (!roundAccount) throw new Error('Round account not found');

    const rbuf = Buffer.from(roundAccount.data);
    const deployed: string[] = [];
    for (let i = 0; i < 25; i++) {
      deployed.push(readU64LE(rbuf, 16 + i * 8).toString());
    }
    const totalDeployed = readU64LE(rbuf, 536).toString();
    const expiresAt = readU64LE(rbuf, 448).toString();
    const miningOpen = currentSlot < endSlot;
    const miningSecondsRemaining = miningOpen ? Number(endSlot - currentSlot) * 0.4 : 0;
    const claimHoursRemaining =
      BigInt(expiresAt) > currentSlot
        ? Number(BigInt(expiresAt) - currentSlot) * 0.4 / 3600
        : 0;

    // find top squares by expected value
    const totalBig = BigInt(totalDeployed);
    const squares = deployed.map((d, idx) => {
      const dep = BigInt(d);
      const ev = dep === 0n ? 99 : Number(totalBig - dep) / Number(dep);
      return { index: idx, deployed: d, ev, isEmpty: dep === 0n };
    });
    const topSquares = [...squares].sort((a, b) => b.ev - a.ev).slice(0, 5).map(s => s.index);
    const emptySquares = squares.filter(s => s.isEmpty).map(s => s.index);

    return NextResponse.json({
      ok: true,
      data: {
        roundId: roundId.toString(),
        miningOpen,
        miningSecondsRemaining: Math.round(miningSecondsRemaining),
        claimHoursRemaining: Math.round(claimHoursRemaining * 10) / 10,
        totalDeployedSol: Number(totalBig) / 1e9,
        topSquares,
        emptySquares,
        currentSlot: currentSlot.toString(),
        endSlot: endSlot.toString(),
      },
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 503 });
  }
}
