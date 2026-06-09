import type { HybridControllerConfig } from './controller.js';

export interface OrelaneAppConfig extends HybridControllerConfig {
  telegramBotToken?: string;
  telegramAllowedChats: string[];
  deepseekApiKey?: string;
  deepseekModel: string;
  openrouterApiKey?: string;
  openrouterModel: string;
  heliusApiKey?: string;
  perpsCliPath: string;
  perpsProjectRoot: string;
  vulcanBin: string;
  vulcanWalletName?: string;
  vulcanWalletPassword?: string;
  dashboardUrl: string;
  x402PaymentUrl: string;
  rigControlLive: boolean;
  liveTrading: boolean;
  perpsSimOnly: boolean;
  paymentsLive: boolean;
}

function envNumber(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  return raw ? Number.parseFloat(raw) : fallback;
}

function parseCsv(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function loadOrelaneAppConfig(env: NodeJS.ProcessEnv = process.env): OrelaneAppConfig {
  const rpcUrl = env.RPC ?? env.HELIUS_RPC_URL;
  if (!rpcUrl) {
    throw new Error('RPC or HELIUS_RPC_URL is required');
  }

  const keypairPath = env.KEYPAIR;
  const keypairBase58 = env.KEYPAIR_BASE58;
  const dryRun = env.DRY_RUN === 'true';
  if (!dryRun && !keypairPath && !keypairBase58) {
    throw new Error('KEYPAIR or KEYPAIR_BASE58 is required for live execution');
  }

  return {
    rpcUrl,
    keypairPath,
    keypairBase58,
    bitaxeUrl: env.BITAXE_URL ?? 'http://192.168.1.174/',
    x402OreUrl: env.X402_ORE_URL ?? 'https://x402.wtf/ore',
    tickIntervalMs: Number.parseInt(env.TICK_INTERVAL_MS ?? '60000', 10),
    dryRun,
    liveExecution: env.LIVE_EXECUTION === 'true',
    operatorConfirmed: env.OPERATOR_CONFIRMED === 'true',
    limits: {
      maxTempC: envNumber(env, 'BITAXE_MAX_TEMP_C', 72),
      maxCpuUsage: envNumber(env, 'BITAXE_MAX_CPU', 75),
      minFreeHeapBytes: envNumber(env, 'BITAXE_MIN_FREE_HEAP', 150000),
      minWifiRssi: envNumber(env, 'BITAXE_MIN_RSSI', -75),
    },
    policy: {
      maxDeployPerRoundSol: envNumber(env, 'MAX_DEPLOY_SOL', 0.05),
      minReserveSol: envNumber(env, 'MIN_RESERVE_SOL', 0.05),
      maxSquaresPerRound: Number.parseInt(env.MAX_SQUARES_PER_ROUND ?? '3', 10),
      claimSolThreshold: envNumber(env, 'CLAIM_SOL_THRESHOLD', 0.01),
      claimOreThreshold: envNumber(env, 'CLAIM_ORE_THRESHOLD', 0.5),
      requireHealthyBitaxe: env.REQUIRE_HEALTHY_BITAXE !== 'false',
    },
    telegramBotToken: env.TELEGRAM_BOT_TOKEN || undefined,
    telegramAllowedChats: parseCsv(env.TELEGRAM_ALLOWED_CHATS),
    deepseekApiKey: env.DEEPSEEK_API_KEY || undefined,
    deepseekModel: env.DEEPSEEK_MODEL ?? 'deepseek-v4-pro',
    openrouterApiKey: env.OPENROUTER_API_KEY || undefined,
    openrouterModel: env.OPENROUTER_MODEL ?? 'openrouter/free',
    heliusApiKey: env.HELIUS_API_KEY || undefined,
    perpsCliPath:
      env.CLAWD_PERPS_CLI_PATH ??
      '/Users/8bit/solana-os-go/solana-clawd/perps/clawd-agents-perps/dist/cli.js',
    perpsProjectRoot:
      env.CLAWD_PERPS_PROJECT_ROOT ??
      '/Users/8bit/solana-os-go/solana-clawd/perps/clawd-agents-perps',
    vulcanBin: env.VULCAN_BIN ?? 'vulcan',
    vulcanWalletName: env.VULCAN_WALLET_NAME || undefined,
    vulcanWalletPassword: env.VULCAN_WALLET_PASSWORD || undefined,
    dashboardUrl: env.ORELANE_DASHBOARD_URL ?? env.X402_ORE_URL ?? 'https://x402.wtf/ore',
    x402PaymentUrl: env.X402_PAYMENT_URL ?? 'https://x402.wtf/ore',
    rigControlLive: env.RIG_CONTROL_LIVE === 'true',
    liveTrading: env.LIVE_TRADING === 'true',
    perpsSimOnly: env.PERPS_SIM_ONLY !== 'false',
    paymentsLive: env.PAYMENTS_LIVE === 'true',
  };
}
