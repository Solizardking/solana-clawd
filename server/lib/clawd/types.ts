export type Venue = 'paper-solana' | 'solana' | 'hyperliquid';
export type Side = 'long' | 'short';
export type SignalDir = 'BUY' | 'SELL' | 'HOLD';
export type GateAction = 'APPROVE' | 'VETO' | 'DEFER';
export type AgentStatus = 'idle' | 'running' | 'paused' | 'killed';
export type AgentMode = 'paper' | 'solana' | 'hyperliquid';

export interface PriceSnapshot {
  symbol: string;
  mint: string;
  price: number;
  priceChange1h: number;
  priceChange24h: number;
  volume24h: number;
  ts: number;
  history: number[];
}

export interface StrategySignal {
  symbol: string;
  mint: string;
  direction: SignalDir;
  score: number;
  reasons: string[];
  suggestedNotionalUsd: number;
  ts: number;
}

export interface GateDecision {
  action: GateAction;
  reasoning: string;
  reasoningStream?: AsyncIterable<string>;
}

export interface Fill {
  id?: number;
  ts: number;
  venue: Venue;
  symbol: string;
  side: 'buy' | 'sell';
  size: number;
  price: number;
  notionalUsd: number;
  pnlUsd?: number;
  mode: AgentMode;
  txSignature?: string;
  decisionId?: number;
}

export interface Position {
  id?: number;
  venue: Venue;
  symbol: string;
  side: Side;
  size: number;
  entryPrice: number;
  currentPrice?: number;
  pnlUsd: number;
  openedAt: number;
}

export interface ArenaEvent {
  type: 'tick' | 'snapshot' | 'signal' | 'gate_token' | 'gate_decision' | 'fill' | 'position_update' | 'state' | 'log' | 'error' | 'pump_stream';
  ts: number;
  payload: any;
}

export interface WatchItem {
  symbol: string;
  mint: string;
  enabled: boolean;
}
