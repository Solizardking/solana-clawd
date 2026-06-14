import { LAMPORTS_PER_SOL } from '@solana/web3.js';

// Simulated oracle for AI-driven price adjustments (now unused)
class Oracle {
  static async getDynamicPriceAdjustment(currentPrice: bigint): Promise<bigint> {
    // AI-driven adjustment simulation (temporary)
    const adjustment = Math.random() * 0.1 - 0.05; // -5% to +5%
    return BigInt(Math.floor(Number(currentPrice) * (1 + adjustment)));
  }
}

interface BuyResult {
  tokenAmount: bigint;
  solAmount: bigint;
}

interface SellResult {
  tokenAmount: bigint;
  solAmount: bigint;
}

export class AMM {
  private virtualSolReserves: bigint;
  private virtualTokenReserves: bigint;
  private realSolReserves: bigint;
  private realTokenReserves: bigint;
  private initialVirtualTokenReserves: bigint;

  constructor(
    virtualSolReserves: string | bigint,
    virtualTokenReserves: string | bigint,
    realSolReserves: string | bigint,
    realTokenReserves: string | bigint,
    initialVirtualTokenReserves?: string | bigint
  ) {
    this.virtualSolReserves = BigInt(virtualSolReserves);
    this.virtualTokenReserves = BigInt(virtualTokenReserves);
    this.realSolReserves = BigInt(realSolReserves);
    this.realTokenReserves = BigInt(realTokenReserves);
    this.initialVirtualTokenReserves = initialVirtualTokenReserves 
      ? BigInt(initialVirtualTokenReserves)
      : BigInt(virtualTokenReserves);
  }

  getBuyPrice(tokens: bigint | number): bigint | null {
    const tokenAmount = BigInt(tokens);
    if (tokenAmount === 0n || tokenAmount > this.virtualTokenReserves) {
      return null;
    }

    const product = this.virtualSolReserves * this.virtualTokenReserves;
    const newVirtualTokenReserves = this.virtualTokenReserves - tokenAmount;

    if (newVirtualTokenReserves <= 0n) {
      return null;
    }

    const newVirtualSolReserves = product / newVirtualTokenReserves + 1n;
    const amountNeeded = newVirtualSolReserves > this.virtualSolReserves
      ? newVirtualSolReserves - this.virtualSolReserves
      : 0n;

    return amountNeeded;
  }

  getSellPrice(tokens: bigint | number): bigint | null {
    const tokenAmount = BigInt(tokens);
    if (tokenAmount <= 0n || tokenAmount > this.virtualTokenReserves) {
      return null;
    }

    const scalingFactor = this.initialVirtualTokenReserves;
    const tokenSellProportion = (tokenAmount * scalingFactor) / this.virtualTokenReserves;
    const solReceived = (this.virtualSolReserves * tokenSellProportion) / scalingFactor;

    return solReceived < this.realSolReserves ? solReceived : this.realSolReserves;
  }

  applyBuy(tokens: bigint | number): BuyResult | null {
    const tokenAmount = BigInt(tokens);
    const finalTokenAmount = tokenAmount > this.realTokenReserves
      ? this.realTokenReserves
      : tokenAmount;

    const solAmount = this.getBuyPrice(finalTokenAmount);
    if (solAmount === null) return null;

    this.virtualTokenReserves -= finalTokenAmount;
    this.realTokenReserves -= finalTokenAmount;
    this.virtualSolReserves += solAmount;
    this.realSolReserves += solAmount;

    return {
      tokenAmount: finalTokenAmount,
      solAmount
    };
  }

  applySell(tokens: bigint | number): SellResult | null {
    const tokenAmount = BigInt(tokens);

    this.virtualTokenReserves += tokenAmount;
    this.realTokenReserves += tokenAmount;

    const solAmount = this.getSellPrice(tokenAmount);
    if (solAmount === null) return null;

    this.virtualSolReserves -= solAmount;
    this.realSolReserves -= solAmount;

    return {
      tokenAmount,
      solAmount
    };
  }

  getCurrentReserves() {
    return {
      virtualSolReserves: this.virtualSolReserves,
      virtualTokenReserves: this.virtualTokenReserves,
      realSolReserves: this.realSolReserves,
      realTokenReserves: this.realTokenReserves
    };
  }

  getMarketCapSOL(): number {
    if (this.virtualTokenReserves === 0n) return 0;
    const marketCap = Number(this.tokenTotalSupply * this.virtualSolReserves) / 
                     Number(this.virtualTokenReserves);
    return marketCap / LAMPORTS_PER_SOL;
  }

  get tokenTotalSupply(): bigint {
    return this.realTokenReserves + this.virtualTokenReserves;
  }
}