import { PublicKey } from "@solana/web3.js";

export type IDL = {
  version: string;
  name: string;
  instructions: Array<{
    name: string;
    accounts: Array<{
      name: string;
      isMut: boolean;
      isSigner: boolean;
    }>;
    args: Array<{
      name: string;
      type: string;
    }>;
  }>;
  events: Array<{
    name: string;
    fields: Array<{
      name: string;
      type: string;
      index: boolean;
    }>;
  }>;
};

export interface CreateTokenMetadata {
  name: string;
  symbol: string;
  description: string;
  file: Blob;
  twitter?: string;
  telegram?: string;
  website?: string;
}

export interface TransactionResult {
  signature: string;
  transaction: any;
}

export interface PriorityFee {
  computeUnits?: number;
  microLamports?: number;
}

export type PumpFunEventType = "createEvent" | "tradeEvent" | "completeEvent" | "setParamsEvent";

export interface PumpFunEventHandlers {
  createEvent: {
    mint: PublicKey;
    creator: PublicKey;
  };
  tradeEvent: {
    mint: PublicKey;
    trader: PublicKey;
    tokenAmount: bigint;
    solAmount: bigint;
    isBuy: boolean;
  };
  completeEvent: {
    mint: PublicKey;
  };
  setParamsEvent: {
    mint: PublicKey;
    authority: PublicKey;
  };
}

export type {
  CreateEvent,
  TradeEvent,
  CompleteEvent,
  SetParamsEvent,
} from './events';
