export type BotIntentAction =
  | 'help'
  | 'status'
  | 'optimize'
  | 'bitaxe_pause'
  | 'bitaxe_resume'
  | 'bitaxe_reboot'
  | 'bitaxe_freq_get'
  | 'bitaxe_freq_set'
  | 'bitaxe_hashrate'
  | 'bitaxe_efficiency'
  | 'bitaxe_led_set'
  | 'bitaxe_led_cycle'
  | 'ore_decision'
  | 'ore_checkpoint'
  | 'ore_claim'
  | 'ore_deploy_preview'
  | 'perps_status'
  | 'perps_paper_trade'
  | 'perps_live_preview'
  | 'vulcan_ticker'
  | 'vulcan_ta'
  | 'vulcan_candles'
  | 'vulcan_positions'
  | 'vulcan_portfolio'
  | 'vulcan_margin'
  | 'wallet_assets'
  | 'payments_status'
  | 'agents_status'
  | 'dashboards_status';

export interface BotIntent {
  action: BotIntentAction;
  symbol?: string;
  side?: 'long' | 'short';
  notionalUsd?: number;
  amountSol?: number;
  squares?: number[];
  frequencyMhz?: number;
  ledColor?: string;
  timeframe?: string;
  rawText?: string;
}

export interface OperatorResponse {
  ok: boolean;
  text: string;
  data?: unknown;
}
