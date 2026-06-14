import { describe, expect, it } from 'vitest';
import { oreAmount, solAmount, solToLamports } from '../constants.js';

describe('solAmount', () => {
  it('formats whole SOL', () => {
    expect(solAmount(1_000_000_000n)).toBe('1.0');
  });

  it('formats fractional SOL', () => {
    expect(solAmount(500_000_000n)).toBe('0.5');
  });

  it('formats small amounts', () => {
    expect(solAmount(1_000_000n)).toBe('0.001');
  });

  it('formats zero', () => {
    expect(solAmount(0n)).toBe('0.0');
  });

  it('formats large amounts', () => {
    expect(solAmount(10_500_000_000n)).toBe('10.5');
  });
});

describe('solToLamports', () => {
  it('converts 1 SOL', () => {
    expect(solToLamports(1)).toBe(1_000_000_000n);
  });

  it('converts fractional SOL', () => {
    expect(solToLamports(0.05)).toBe(50_000_000n);
  });

  it('converts zero', () => {
    expect(solToLamports(0)).toBe(0n);
  });
});

describe('oreAmount', () => {
  it('formats whole ORE', () => {
    expect(oreAmount(100_000_000_000n)).toBe('1.0');
  });

  it('formats zero', () => {
    expect(oreAmount(0n)).toBe('0.0');
  });

  it('formats fractional ORE', () => {
    const half = 50_000_000_000n;
    expect(oreAmount(half)).toBe('0.5');
  });
});
