import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

export interface CreateEvent {
  mint: PublicKey;
  creator: PublicKey;
}

export interface TradeEvent {
  mint: PublicKey;
  trader: PublicKey;
  tokenAmount: BN;
  solAmount: BN;
  isBuy: boolean;
}

export interface CompleteEvent {
  mint: PublicKey;
}

export interface SetParamsEvent {
  mint: PublicKey;
  authority: PublicKey;
}

export function toCreateEvent(event: CreateEvent): CreateEvent {
  return {
    mint: event.mint,
    creator: event.creator,
  };
}

export function toTradeEvent(event: TradeEvent): {
  mint: PublicKey;
  trader: PublicKey;
  tokenAmount: bigint;
  solAmount: bigint;
  isBuy: boolean;
} {
  return {
    mint: event.mint,
    trader: event.trader,
    tokenAmount: BigInt(event.tokenAmount.toString()),
    solAmount: BigInt(event.solAmount.toString()),
    isBuy: event.isBuy,
  };
}

export function toCompleteEvent(event: CompleteEvent): CompleteEvent {
  return {
    mint: event.mint,
  };
}

export function toSetParamsEvent(event: SetParamsEvent): SetParamsEvent {
  return {
    mint: event.mint,
    authority: event.authority,
  };
}
