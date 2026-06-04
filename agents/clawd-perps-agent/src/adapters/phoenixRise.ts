import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ClaWDPerps } from "@openclawdsolana/clawd-perps";
import type { PerpsConfig, ToolResult } from "@openclawdsolana/clawd-perps";
import type { PerpsRuntimeConfig } from "../config.js";
import { redactSensitiveText } from "../redaction.js";

const execFileAsync = promisify(execFile);

export interface PhoenixPerpMarketView {
  symbol: string;
  markPrice?: number | null;
  spotPrice?: number | null;
  fundingRate?: number | null;
  openInterest?: number | null;
  status?: string | null;
  source?: "rise" | "vulcan";
}

export interface PhoenixRiseAdapter {
  listMarkets(): Promise<PhoenixPerpMarketView[]>;
  getTicker(symbol?: string): Promise<unknown>;
  getOrderbook(symbol: string, depth?: number): Promise<unknown>;
  getTraderSnapshot(authority?: string): Promise<unknown>;
  getPositions(authority?: string): Promise<unknown>;
  health(): Promise<unknown>;
}

function unwrapResult<T>(label: string, result: ToolResult): T {
  if (!result.success) {
    throw new Error(result.error ?? `${label} failed`);
  }
  return result.data as T;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

interface VulcanJsonEnvelope<T> {
  ok?: boolean;
  data?: T;
  error?: { message?: string } | string;
}

async function runVulcanJson<T>(
  config: PerpsRuntimeConfig,
  label: string,
  args: string[],
): Promise<T> {
  const globalArgs = [
    ...(config.rpcUrl ? ["--rpc-url", config.rpcUrl] : []),
    ...(config.apiUrl ? ["--api-url", config.apiUrl] : []),
  ];

  try {
    const { stdout } = await execFileAsync("vulcan", [...globalArgs, ...args, "-o", "json"], {
      timeout: 20_000,
      env: {
        ...process.env,
        NO_COLOR: "1",
      },
      maxBuffer: 10 * 1024 * 1024,
    });
    const parsed = JSON.parse(stdout) as VulcanJsonEnvelope<T>;
    if (parsed.ok === false) {
      const message =
        typeof parsed.error === "string" ? parsed.error : parsed.error?.message ?? `${label} failed`;
      throw new Error(message);
    }
    return (parsed.data ?? parsed) as T;
  } catch (error) {
    const maybeChildError = error as { stdout?: unknown; stderr?: unknown; code?: unknown };
    if (typeof maybeChildError.stdout === "string" && maybeChildError.stdout.trim()) {
      let parsed: VulcanJsonEnvelope<T> | undefined;
      try {
        parsed = JSON.parse(maybeChildError.stdout) as VulcanJsonEnvelope<T>;
      } catch {
        // Fall through to the scrubbed process error below.
      }
      if (parsed?.ok === false) {
        const message =
          typeof parsed.error === "string"
            ? parsed.error
            : parsed.error?.message ?? `${label} failed`;
        throw new Error(message);
      }
    }

    const stderr =
      typeof maybeChildError.stderr === "string" ? redactSensitiveText(maybeChildError.stderr.trim()) : "";
    const suffix = stderr ? `: ${stderr.split("\n")[0]}` : "";
    throw new Error(`${label}: vulcan exited ${String(maybeChildError.code ?? "with an error")}${suffix}`);
  }
}

function normalizeVulcanMarket(market: Record<string, unknown>): PhoenixPerpMarketView {
  return {
    symbol: String(market.symbol ?? "").toUpperCase(),
    status: typeof market.status === "string" ? market.status : null,
    markPrice: typeof market.mark_price === "number" ? market.mark_price : null,
    fundingRate: typeof market.funding_rate === "number" ? market.funding_rate : null,
    openInterest: typeof market.open_interest === "number" ? market.open_interest : null,
    source: "vulcan",
  };
}

export class ClawdPhoenixRiseAdapter implements PhoenixRiseAdapter {
  private readonly perps: ClaWDPerps;

  constructor(private readonly config: PerpsRuntimeConfig) {
    const perpsConfig: Partial<PerpsConfig> & Record<string, unknown> = {
      apiUrl: config.apiUrl,
      rpcUrl: config.rpcUrl,
      walletName: config.wallet,
      traderSubaccountIndex: config.traderSubaccountIndex,
    };
    // traderPdaIndex exists at runtime but is missing from the published type declaration
    (perpsConfig as Record<string, unknown>).traderPdaIndex = config.traderPdaIndex;
    this.perps = new ClaWDPerps(perpsConfig);
  }

  async listMarkets(): Promise<PhoenixPerpMarketView[]> {
    try {
      return unwrapResult<PhoenixPerpMarketView[]>("listMarkets", await this.perps.listMarkets()).map(
        (market) => ({ ...market, source: "rise" }),
      );
    } catch {
      const data = await runVulcanJson<{ markets?: Array<Record<string, unknown>> }>(
        this.config,
        "vulcan market list",
        ["market", "list"],
      );
      return (data.markets ?? []).map(normalizeVulcanMarket).filter((market) => market.symbol);
    }
  }

  async getTicker(symbol?: string): Promise<unknown> {
    try {
      const result = symbol
        ? await this.perps.getTicker(normalizeSymbol(symbol))
        : await this.perps.getAllTickers();
      return unwrapResult("getTicker", result);
    } catch {
      if (!symbol) {
        return this.listMarkets();
      }
      return runVulcanJson(this.config, "vulcan market ticker", [
        "market",
        "ticker",
        normalizeSymbol(symbol),
      ]);
    }
  }

  async getOrderbook(symbol: string, depth = 20): Promise<unknown> {
    try {
      return unwrapResult(
        "getOrderbook",
        await this.perps.getOrderbook(normalizeSymbol(symbol), depth),
      );
    } catch {
      return runVulcanJson(this.config, "vulcan market orderbook", [
        "market",
        "orderbook",
        normalizeSymbol(symbol),
        "--depth",
        String(depth),
      ]);
    }
  }

  async getTraderSnapshot(authority?: string): Promise<unknown> {
    try {
      return unwrapResult("getPortfolio", await this.perps.getPortfolio(authority));
    } catch (error) {
      if (authority) {
        throw error;
      }
      return runVulcanJson(this.config, "vulcan portfolio", ["portfolio"]);
    }
  }

  async getPositions(authority?: string): Promise<unknown> {
    try {
      return unwrapResult("listPositions", await this.perps.listPositions(authority));
    } catch (error) {
      if (authority) {
        throw error;
      }
      return runVulcanJson(this.config, "vulcan position list", ["position", "list"]);
    }
  }

  async health(): Promise<unknown> {
    try {
      return {
        ok: true,
        source: "rise",
        data: unwrapResult("health", await this.perps.health()),
      };
    } catch (primaryError) {
      return {
        ok: true,
        source: "vulcan",
        primary: {
          ok: false,
          source: "rise",
          error: errorMessage(primaryError),
        },
        data: await runVulcanJson(this.config, "vulcan status", ["status"]),
      };
    }
  }
}

export function createPhoenixRiseAdapter(config: PerpsRuntimeConfig): PhoenixRiseAdapter {
  return new ClawdPhoenixRiseAdapter(config);
}
