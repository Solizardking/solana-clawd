// @ts-nocheck
import { BondingCurveAccount } from './bondingCurveAccount';
import { GlobalAccount } from './globalAccount';

export type BuyResult = {
    tokenAmount: bigint;
    solAmount: bigint;
};

export type SellResult = {
    tokenAmount: bigint;
    solAmount: bigint;
};

export class AMM {
    constructor(
        public virtualSolReserves: bigint,
        public virtualTokenReserves: bigint,
        public realSolReserves: bigint,
        public realTokenReserves: bigint,
        public initialVirtualTokenReserves: bigint
    ) {}

    static fromGlobalAccount(global: GlobalAccount): AMM {
        return new AMM(
            global.initialVirtualSolReserves,
            global.initialVirtualTokenReserves,
            0n,
            global.initialRealTokenReserves,
            global.initialVirtualTokenReserves
        );
    }

    static fromBondingCurveAccount(bondingCurve: BondingCurveAccount, initialVirtualTokenReserves: bigint): AMM {
        return new AMM(
            bondingCurve.virtualSolReserves,
            bondingCurve.virtualTokenReserves,
            bondingCurve.realSolReserves,
            bondingCurve.realTokenReserves,
            initialVirtualTokenReserves
        );
    }

    getBuyPrice(tokens: bigint): bigint {
        const productOfReserves = this.virtualSolReserves * this.virtualTokenReserves;
        const newVirtualTokenReserves = this.virtualTokenReserves - tokens;
        if (newVirtualTokenReserves <= 0n) return 0n;
        
        const newVirtualSolReserves = productOfReserves / newVirtualTokenReserves + 1n;
        const amountNeeded = newVirtualSolReserves > this.virtualSolReserves 
            ? newVirtualSolReserves - this.virtualSolReserves 
            : 0n;
        return amountNeeded > 0n ? amountNeeded : 0n;
    }

    applyBuy(tokenAmount: bigint): BuyResult {
        const finalTokenAmount = tokenAmount > this.realTokenReserves 
            ? this.realTokenReserves 
            : tokenAmount;
        const solAmount = this.getBuyPrice(finalTokenAmount);

        this.virtualTokenReserves -= finalTokenAmount;
        this.realTokenReserves -= finalTokenAmount;
        this.virtualSolReserves += solAmount;
        this.realSolReserves += solAmount;

        return {
            tokenAmount: finalTokenAmount,
            solAmount
        };
    }

    applySell(tokenAmount: bigint): SellResult {
        this.virtualTokenReserves += tokenAmount;
        this.realTokenReserves += tokenAmount;

        const sellPrice = this.getSellPrice(tokenAmount);

        this.virtualSolReserves -= sellPrice;
        this.realSolReserves -= sellPrice;

        return {
            tokenAmount,
            solAmount: sellPrice
        };
    }

    getSellPrice(tokens: bigint): bigint {
        const scalingFactor = this.initialVirtualTokenReserves;
        const tokenSellProportion = (tokens * scalingFactor) / this.virtualTokenReserves;
        const solReceived = (this.virtualSolReserves * tokenSellProportion) / scalingFactor;
        return solReceived < this.realSolReserves ? solReceived : this.realSolReserves;
    }

    getMarketCapSOL(): bigint {
        if (this.virtualTokenReserves === 0n) return 0n;
        return (this.virtualSolReserves * this.initialVirtualTokenReserves) / this.virtualTokenReserves;
    }
}
