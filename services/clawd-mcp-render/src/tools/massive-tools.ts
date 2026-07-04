import type { ToolDef, ToolHandler } from "../orchestrator.js";

type HttpMethod = "GET" | "POST";
type TableRow = Record<string, unknown>;

interface StoredTable {
  name: string;
  source: string;
  createdAt: string;
  rows: TableRow[];
  rowCount: number;
  truncated: boolean;
  columns: string[];
}

interface ApplyResult {
  rows: TableRow[];
  applied: string[];
  metrics: Record<string, number | null>;
}

const DEFAULT_API_BASE_URL = "https://api.massive.com";
const DEFAULT_LLMS_TXT_URL = "https://massive.com/docs/rest/llms.txt";
const DOC_CACHE_TTL_MS = 5 * 60 * 1000;
const RESPONSE_ROW_LIMIT = 250;
const tableStore = new Map<string, StoredTable>();

let docsCache: { text: string; fetchedAt: number } | null = null;

const BUILTIN_FUNCTIONS = [
  "bs_price(type, underlying, strike, years_to_expiration, volatility, risk_free_rate=0.05, dividend_yield=0)",
  "bs_delta(type, underlying, strike, years_to_expiration, volatility, risk_free_rate=0.05, dividend_yield=0)",
  "bs_gamma(type, underlying, strike, years_to_expiration, volatility, risk_free_rate=0.05, dividend_yield=0)",
  "bs_theta(type, underlying, strike, years_to_expiration, volatility, risk_free_rate=0.05, dividend_yield=0)",
  "bs_vega(type, underlying, strike, years_to_expiration, volatility, risk_free_rate=0.05, dividend_yield=0)",
  "bs_rho(type, underlying, strike, years_to_expiration, volatility, risk_free_rate=0.05, dividend_yield=0)",
  "simple_return(column)",
  "log_return(column)",
  "cumulative_return(column)",
  "sharpe_ratio(column, annualization=252)",
  "sortino_ratio(column, annualization=252)",
  "sma(column, window)",
  "ema(column, window)",
];

function maxTables(): number {
  return Math.max(1, Number(process.env.MASSIVE_MAX_TABLES ?? 50));
}

function maxRows(): number {
  return Math.max(1, Number(process.env.MASSIVE_MAX_ROWS ?? 50_000));
}

function apiBaseUrl(): string {
  return (process.env.MASSIVE_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/$/, "");
}

function llmsTxtUrl(): string {
  return process.env.MASSIVE_LLMS_TXT_URL ?? DEFAULT_LLMS_TXT_URL;
}

function getApiKey(override?: unknown): string {
  const key = typeof override === "string" && override.trim() ? override.trim() : process.env.MASSIVE_API_KEY;
  if (!key) {
    throw new Error("MASSIVE_API_KEY is not set. Add it to the MCP environment before using Massive stock tools.");
  }
  return key;
}

function cleanTicker(input: unknown): string {
  const ticker = String(input ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9._-]{1,32}$/.test(ticker)) {
    throw new Error(`Invalid stock ticker: ${String(input)}`);
  }
  return ticker;
}

function cleanTableName(input: unknown): string {
  const name = String(input ?? "").trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name)) {
    throw new Error("Table names must start with a letter or underscore and contain only letters, numbers, and underscores.");
  }
  return name;
}

function asPlainObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

function appendParams(url: URL, params: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null) url.searchParams.append(key, String(item));
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
}

function buildApiUrl(path: string, params: Record<string, unknown>, apiKey: string): URL {
  if (!path.startsWith("/")) {
    throw new Error("Massive API path must start with '/'. Full upstream URLs are not accepted by this tool.");
  }

  const url = new URL(path, `${apiBaseUrl()}/`);
  appendParams(url, params);
  if (!url.searchParams.has("apiKey")) url.searchParams.set("apiKey", apiKey);
  return url;
}

async function massiveApi(
  method: HttpMethod,
  path: string,
  params: Record<string, unknown>,
  apiKeyOverride?: unknown,
): Promise<unknown> {
  const apiKey = getApiKey(apiKeyOverride);
  const upperMethod = method === "POST" ? "POST" : "GET";
  const url = buildApiUrl(path, upperMethod === "GET" ? params : {}, apiKey);
  const res = await fetch(url, {
    method: upperMethod,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: upperMethod === "POST" ? JSON.stringify(params) : undefined,
    signal: AbortSignal.timeout(30_000),
  });

  const contentType = res.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const message = typeof data === "string" ? data.slice(0, 500) : JSON.stringify(data).slice(0, 500);
    throw new Error(`Massive ${upperMethod} ${path} returned HTTP ${res.status}: ${message}`);
  }
  return data;
}

function normalizeRow(row: TableRow): TableRow {
  const out: TableRow = { ...row };
  const mappings: Array<[string, string]> = [
    ["o", "open"],
    ["h", "high"],
    ["l", "low"],
    ["c", "close"],
    ["v", "volume"],
    ["vw", "vwap"],
    ["n", "transactions"],
  ];
  for (const [shortKey, longKey] of mappings) {
    if (out[longKey] === undefined && out[shortKey] !== undefined) out[longKey] = out[shortKey];
  }
  if (typeof out.t === "number") {
    out.timestamp_ms = out.t;
    out.datetime = new Date(out.t).toISOString();
    out.date = new Date(out.t).toISOString().slice(0, 10);
  }
  return out;
}

function extractRows(data: unknown): TableRow[] {
  if (Array.isArray(data)) return data.filter((row) => row && typeof row === "object").map((row) => normalizeRow(row as TableRow));
  if (!data || typeof data !== "object") return [];

  const obj = data as Record<string, unknown>;
  for (const key of ["results", "tickers", "data", "items"]) {
    const value = obj[key];
    if (Array.isArray(value)) {
      return value.filter((row) => row && typeof row === "object").map((row) => normalizeRow(row as TableRow));
    }
  }
  if (obj.results && typeof obj.results === "object") return [normalizeRow(obj.results as TableRow)];
  if (obj.ticker && typeof obj.ticker === "object") return [normalizeRow(obj.ticker as TableRow)];
  return [normalizeRow(obj)];
}

function columnsFor(rows: TableRow[]): string[] {
  const columns = new Set<string>();
  for (const row of rows.slice(0, 100)) {
    for (const key of Object.keys(row)) columns.add(key);
  }
  return [...columns].sort();
}

function storeRows(nameInput: unknown, rows: TableRow[], source: string): Omit<StoredTable, "rows"> {
  const name = cleanTableName(nameInput);
  if (!tableStore.has(name) && tableStore.size >= maxTables()) {
    throw new Error(`Massive table store is full (${maxTables()} tables). Drop a table with massive_tables action="drop" first.`);
  }
  const limitedRows = rows.slice(0, maxRows());
  const record: StoredTable = {
    name,
    source,
    createdAt: new Date().toISOString(),
    rows: limitedRows,
    rowCount: limitedRows.length,
    truncated: rows.length > limitedRows.length,
    columns: columnsFor(limitedRows),
  };
  tableStore.set(name, record);
  const { rows: _rows, ...metadata } = record;
  return metadata;
}

function numberAt(row: TableRow, column: string): number | null {
  const value = row[column];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function argByName(args: string[], names: string[], fallbackIndex: number): string | undefined {
  const lowered = names.map((name) => name.toLowerCase());
  for (const arg of args) {
    const eq = arg.indexOf("=");
    if (eq <= 0) continue;
    const name = arg.slice(0, eq).trim().toLowerCase();
    if (lowered.includes(name)) return arg.slice(eq + 1).trim();
  }
  return args[fallbackIndex];
}

function numericArg(row: TableRow, arg: string | undefined, fallback?: number): number | null {
  if (arg === undefined || arg === "") return fallback ?? null;
  const raw = stripQuotes(arg);
  const columnValue = numberAt(row, raw);
  if (columnValue !== null) return columnValue;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback ?? null;
}

function textArg(row: TableRow, arg: string | undefined, fallback = ""): string {
  if (arg === undefined || arg === "") return fallback;
  const raw = stripQuotes(arg);
  const value = row[raw];
  return value === undefined || value === null ? raw : String(value);
}

function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return sign * y;
}

function normalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function blackScholesMetric(
  metric: string,
  typeRaw: string,
  underlying: number | null,
  strike: number | null,
  yearsToExpiration: number | null,
  volatility: number | null,
  riskFreeRate: number | null,
  dividendYield: number | null,
): number | null {
  const optionType = typeRaw.toLowerCase().startsWith("p") ? "put" : "call";
  const s = underlying;
  const k = strike;
  const t = yearsToExpiration;
  const sigma = volatility;
  const r = riskFreeRate ?? 0.05;
  const q = dividendYield ?? 0;
  if (s === null || k === null || t === null || sigma === null || s <= 0 || k <= 0 || t <= 0 || sigma <= 0) return null;

  const sqrtT = Math.sqrt(t);
  const d1 = (Math.log(s / k) + (r - q + 0.5 * sigma * sigma) * t) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const discountStrike = k * Math.exp(-r * t);
  const discountSpot = s * Math.exp(-q * t);

  if (metric === "bs_price") {
    return optionType === "call"
      ? discountSpot * normalCdf(d1) - discountStrike * normalCdf(d2)
      : discountStrike * normalCdf(-d2) - discountSpot * normalCdf(-d1);
  }
  if (metric === "bs_delta") {
    return optionType === "call"
      ? Math.exp(-q * t) * normalCdf(d1)
      : Math.exp(-q * t) * (normalCdf(d1) - 1);
  }
  if (metric === "bs_gamma") return Math.exp(-q * t) * normalPdf(d1) / (s * sigma * sqrtT);
  if (metric === "bs_vega") return s * Math.exp(-q * t) * normalPdf(d1) * sqrtT;
  if (metric === "bs_theta") {
    const decay = -(s * normalPdf(d1) * sigma * Math.exp(-q * t)) / (2 * sqrtT);
    return optionType === "call"
      ? decay - r * discountStrike * normalCdf(d2) + q * discountSpot * normalCdf(d1)
      : decay + r * discountStrike * normalCdf(-d2) - q * discountSpot * normalCdf(-d1);
  }
  if (metric === "bs_rho") {
    return optionType === "call"
      ? k * t * Math.exp(-r * t) * normalCdf(d2)
      : -k * t * Math.exp(-r * t) * normalCdf(-d2);
  }
  return null;
}

function parseApply(apply: unknown): Array<{ fn: string; args: string[]; raw: string }> {
  const specs = Array.isArray(apply) ? apply : typeof apply === "string" && apply.trim() ? [apply] : [];
  return specs.map((rawValue) => {
    const raw = String(rawValue).trim();
    const match = raw.match(/^([a-z_]+)\((.*)\)$/i);
    if (!match) throw new Error(`Invalid apply expression: ${raw}`);
    const args = match[2].split(",").map((part) => part.trim()).filter(Boolean);
    return { fn: match[1].toLowerCase(), args, raw };
  });
}

function applyFunctions(rows: TableRow[], apply: unknown): ApplyResult {
  const specs = parseApply(apply);
  const output = rows.map((row) => ({ ...row }));
  const metrics: Record<string, number | null> = {};

  for (const spec of specs) {
    const [column, windowArg] = spec.args;
    if (spec.fn.startsWith("bs_")) {
      const outColumn = spec.fn;
      for (let index = 0; index < output.length; index += 1) {
        const row = output[index];
        output[index][outColumn] = blackScholesMetric(
          spec.fn,
          textArg(row, argByName(spec.args, ["type", "option_type", "side"], 0), "call"),
          numericArg(row, argByName(spec.args, ["underlying", "underlying_price", "spot", "s"], 1)),
          numericArg(row, argByName(spec.args, ["strike", "strike_price", "k"], 2)),
          numericArg(row, argByName(spec.args, ["years_to_expiration", "time_to_expiration", "time", "t"], 3)),
          numericArg(row, argByName(spec.args, ["volatility", "sigma", "iv"], 4)),
          numericArg(row, argByName(spec.args, ["risk_free_rate", "rate", "r"], 5), 0.05),
          numericArg(row, argByName(spec.args, ["dividend_yield", "yield", "q"], 6), 0),
        );
      }
      continue;
    }

    if (!column) throw new Error(`${spec.fn} requires a numeric column`);
    const values = output.map((row) => numberAt(row, column));

    if (spec.fn === "simple_return" || spec.fn === "log_return" || spec.fn === "cumulative_return") {
      const outColumn = `${column}_${spec.fn}`;
      const first = values.find((value): value is number => value !== null && value !== 0) ?? null;
      for (let index = 0; index < output.length; index += 1) {
        const current = values[index];
        const previous = index > 0 ? values[index - 1] : null;
        let computed: number | null = null;
        if (spec.fn === "cumulative_return") {
          computed = current !== null && first !== null ? current / first - 1 : null;
        } else if (current !== null && previous !== null && previous !== 0) {
          computed = spec.fn === "log_return" ? Math.log(current / previous) : current / previous - 1;
        }
        output[index][outColumn] = computed;
      }
      continue;
    }

    if (spec.fn === "sma" || spec.fn === "ema") {
      const window = Math.max(1, Number(windowArg ?? 20));
      if (!Number.isFinite(window)) throw new Error(`${spec.fn} window must be a number`);
      const outColumn = `${column}_${spec.fn}_${window}`;
      let previousEma: number | null = null;
      const alpha = 2 / (window + 1);
      for (let index = 0; index < output.length; index += 1) {
        const current = values[index];
        if (current === null) {
          output[index][outColumn] = null;
          continue;
        }
        if (spec.fn === "sma") {
          const slice = values.slice(Math.max(0, index - window + 1), index + 1).filter((value): value is number => value !== null);
          output[index][outColumn] = slice.length === window ? slice.reduce((sum, value) => sum + value, 0) / window : null;
        } else {
          previousEma = previousEma === null ? current : current * alpha + previousEma * (1 - alpha);
          output[index][outColumn] = previousEma;
        }
      }
      continue;
    }

    if (spec.fn === "sharpe_ratio" || spec.fn === "sortino_ratio") {
      const annualization = Math.max(1, Number(windowArg ?? 252));
      const returns: number[] = [];
      for (let index = 1; index < values.length; index += 1) {
        const current = values[index];
        const previous = values[index - 1];
        if (current !== null && previous !== null && previous !== 0) returns.push(current / previous - 1);
      }
      const mean = returns.reduce((sum, value) => sum + value, 0) / Math.max(returns.length, 1);
      const sample = spec.fn === "sortino_ratio" ? returns.filter((value) => value < 0) : returns;
      const variance = sample.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(sample.length - 1, 1);
      const denominator = Math.sqrt(variance);
      metrics[`${column}_${spec.fn}`] = denominator > 0 ? (mean / denominator) * Math.sqrt(annualization) : null;
      continue;
    }

    throw new Error(`Unsupported apply function: ${spec.fn}`);
  }

  return { rows: output, applied: specs.map((spec) => spec.raw), metrics };
}

function topLevelMetadata(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const metadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      metadata[`${key}Count`] = value.length;
    } else if (value === null || typeof value !== "object") {
      metadata[key] = value;
    }
  }
  return metadata;
}

function apiResponse(data: unknown, rows: TableRow[], apply: unknown, storeAs: unknown, source: string): Record<string, unknown> {
  const applied = applyFunctions(rows, apply);
  const stored = storeAs ? storeRows(storeAs, applied.rows, source) : undefined;
  return {
    source,
    metadata: topLevelMetadata(data),
    rowCount: applied.rows.length,
    returnedRows: Math.min(applied.rows.length, RESPONSE_ROW_LIMIT),
    rows: applied.rows.slice(0, RESPONSE_ROW_LIMIT),
    applied: applied.applied,
    metrics: applied.metrics,
    stored,
  };
}

function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: string | null = null;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quote) {
      if (char === quote && input[index - 1] !== "\\") quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);
    if (char === "," && depth === 0) {
      parts.push(input.slice(start, index).trim());
      start = index + 1;
    }
  }

  const last = input.slice(start).trim();
  if (last) parts.push(last);
  return parts;
}

function findTopLevelKeyword(input: string, phrase: string): number {
  const lower = input.toLowerCase();
  const target = phrase.toLowerCase();
  let depth = 0;
  let quote: string | null = null;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quote) {
      if (char === quote && input[index - 1] !== "\\") quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "(") {
      depth += 1;
      continue;
    }
    if (char === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }

    if (depth === 0 && lower.startsWith(target, index)) {
      const before = index === 0 ? " " : lower[index - 1];
      const after = lower[index + target.length] ?? " ";
      if (/\s/.test(before) && /\s|$/.test(after)) return index;
    }
  }

  return -1;
}

function parseSelectSql(sqlInput: string): {
  select: string;
  table: string;
  where?: string;
  groupBy?: string;
  orderBy?: string;
  limit?: number;
} {
  const sql = sqlInput.trim().replace(/;$/, "");
  if (!/^select\s+/i.test(sql)) throw new Error("massive_query_data currently supports SELECT, SHOW TABLES, DESCRIBE, and DROP TABLE.");

  const afterSelect = sql.replace(/^select\s+/i, "");
  const fromIndex = findTopLevelKeyword(afterSelect, "from");
  if (fromIndex < 0) throw new Error("SELECT query must include FROM <table>.");
  const select = afterSelect.slice(0, fromIndex).trim();
  const afterFrom = afterSelect.slice(fromIndex + "from".length).trim();
  const tableMatch = afterFrom.match(/^([A-Za-z_][A-Za-z0-9_]*)([\s\S]*)$/);
  if (!tableMatch) throw new Error("SELECT query must name a stored Massive table.");

  const table = tableMatch[1];
  const tail = tableMatch[2].trim();
  const clauseDefs = [
    { key: "where", phrase: "where" },
    { key: "groupBy", phrase: "group by" },
    { key: "orderBy", phrase: "order by" },
    { key: "limit", phrase: "limit" },
  ] as const;
  const found = clauseDefs
    .map((def) => ({ ...def, index: findTopLevelKeyword(tail, def.phrase) }))
    .filter((def) => def.index >= 0)
    .sort((a, b) => a.index - b.index);

  const clauses: Record<string, string> = {};
  for (let index = 0; index < found.length; index += 1) {
    const current = found[index];
    const next = found[index + 1];
    clauses[current.key] = tail.slice(current.index + current.phrase.length, next?.index ?? tail.length).trim();
  }

  const limit = clauses.limit === undefined ? undefined : Math.max(0, Number(clauses.limit.split(/\s+/)[0]));
  if (limit !== undefined && !Number.isFinite(limit)) throw new Error("LIMIT must be a number.");

  return {
    select,
    table,
    where: clauses.where,
    groupBy: clauses.groupBy,
    orderBy: clauses.orderBy,
    limit,
  };
}

function compareUnknown(left: unknown, right: unknown): number {
  const leftNumber = typeof left === "number" ? left : typeof left === "string" && left.trim() !== "" ? Number(left) : NaN;
  const rightNumber = typeof right === "number" ? right : typeof right === "string" && right.trim() !== "" ? Number(right) : NaN;
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return String(left ?? "").localeCompare(String(right ?? ""));
}

function valueExpression(row: TableRow, expression: string): unknown {
  const expr = expression.trim();
  const caseMatch = expr.match(/^case\s+when\s+([\s\S]+?)\s+then\s+([\s\S]+?)\s+else\s+([\s\S]+?)\s+end$/i);
  if (caseMatch) return conditionPass(row, caseMatch[1]) ? valueExpression(row, caseMatch[2]) : valueExpression(row, caseMatch[3]);

  const roundMatch = expr.match(/^round\(([\s\S]+?)(?:,\s*(\d+))?\)$/i);
  if (roundMatch) {
    const value = Number(valueExpression(row, roundMatch[1]));
    if (!Number.isFinite(value)) return null;
    const places = Math.max(0, Number(roundMatch[2] ?? 0));
    const factor = 10 ** places;
    return Math.round(value * factor) / factor;
  }

  if ((expr.startsWith("'") && expr.endsWith("'")) || (expr.startsWith('"') && expr.endsWith('"'))) return stripQuotes(expr);
  if (/^-?\d+(?:\.\d+)?$/.test(expr)) return Number(expr);
  if (/^true$/i.test(expr)) return true;
  if (/^false$/i.test(expr)) return false;
  if (/^null$/i.test(expr)) return null;
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(expr)) return row[expr];

  const arithmetic = expr.match(/^(.+?)\s*([+\-*/])\s*(.+)$/);
  if (arithmetic) {
    const left = Number(valueExpression(row, arithmetic[1]));
    const right = Number(valueExpression(row, arithmetic[3]));
    if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
    if (arithmetic[2] === "+") return left + right;
    if (arithmetic[2] === "-") return left - right;
    if (arithmetic[2] === "*") return left * right;
    return right === 0 ? null : left / right;
  }

  return row[expr] ?? expr;
}

function conditionPass(row: TableRow, condition: string): boolean {
  const parts = condition.split(/\s+and\s+/i).map((part) => part.trim()).filter(Boolean);
  return parts.every((part) => {
    const nullMatch = part.match(/^(.+?)\s+is\s+(not\s+)?null$/i);
    if (nullMatch) {
      const value = valueExpression(row, nullMatch[1]);
      const isNull = value === null || value === undefined;
      return nullMatch[2] ? !isNull : isNull;
    }

    const match = part.match(/^(.+?)\s*(<=|>=|<>|!=|=|<|>|like)\s*(.+)$/i);
    if (!match) return Boolean(valueExpression(row, part));
    const left = valueExpression(row, match[1]);
    const right = valueExpression(row, match[3]);
    const op = match[2].toLowerCase();
    if (op === "like") {
      const pattern = String(right ?? "").replace(/%/g, ".*");
      return new RegExp(`^${pattern}$`, "i").test(String(left ?? ""));
    }
    const comparison = compareUnknown(left, right);
    if (op === "=") return comparison === 0;
    if (op === "!=" || op === "<>") return comparison !== 0;
    if (op === "<") return comparison < 0;
    if (op === ">") return comparison > 0;
    if (op === "<=") return comparison <= 0;
    return comparison >= 0;
  });
}

function splitAlias(item: string): { expression: string; alias: string } {
  const match = item.match(/^([\s\S]+?)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)$/i);
  const expression = (match?.[1] ?? item).trim();
  const fallback = expression.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64) || "value";
  return { expression, alias: match?.[2] ?? fallback };
}

function hasAggregate(expression: string): boolean {
  return /\b(count|avg|sum|min|max)\s*\(/i.test(expression);
}

function aggregateValue(rows: TableRow[], expression: string): unknown {
  const expr = expression.trim();
  const roundMatch = expr.match(/^round\(([\s\S]+?)(?:,\s*(\d+))?\)$/i);
  if (roundMatch) {
    const value = Number(aggregateValue(rows, roundMatch[1]));
    if (!Number.isFinite(value)) return null;
    const places = Math.max(0, Number(roundMatch[2] ?? 0));
    const factor = 10 ** places;
    return Math.round(value * factor) / factor;
  }
  if (/^count\(\s*\*\s*\)$/i.test(expr)) return rows.length;

  const match = expr.match(/^(avg|sum|min|max)\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)$/i);
  if (!match) return rows.length > 0 ? valueExpression(rows[0], expr) : null;
  const values = rows.map((row) => numberAt(row, match[2])).filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  const fn = match[1].toLowerCase();
  if (fn === "sum") return values.reduce((sum, value) => sum + value, 0);
  if (fn === "avg") return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (fn === "min") return Math.min(...values);
  return Math.max(...values);
}

function lagDifference(rows: TableRow[], row: TableRow, expression: string): number | null | undefined {
  const match = expression.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*-\s*lag\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)\s+over\s*\(\s*order\s+by\s+([A-Za-z_][A-Za-z0-9_]*)\s*\)$/i);
  if (!match) return undefined;
  const ordered = [...rows].sort((a, b) => compareUnknown(valueExpression(a, match[3]), valueExpression(b, match[3])));
  const index = ordered.indexOf(row);
  if (index <= 0) return null;
  const current = numberAt(row, match[1]);
  const previous = numberAt(ordered[index - 1], match[2]);
  return current !== null && previous !== null ? current - previous : null;
}

function sortRows(rows: TableRow[], orderBy?: string): TableRow[] {
  if (!orderBy) return rows;
  const orderSpecs = splitTopLevel(orderBy).map((item) => {
    const match = item.trim().match(/^([\s\S]+?)(?:\s+(asc|desc))?$/i);
    return { expression: match?.[1]?.trim() ?? item.trim(), desc: match?.[2]?.toLowerCase() === "desc" };
  });

  return [...rows].sort((a, b) => {
    for (const spec of orderSpecs) {
      const comparison = compareUnknown(valueExpression(a, spec.expression), valueExpression(b, spec.expression));
      if (comparison !== 0) return spec.desc ? -comparison : comparison;
    }
    return 0;
  });
}

function projectRows(rows: TableRow[], select: string): TableRow[] {
  const items = splitTopLevel(select);
  if (items.length === 1 && items[0] === "*") return rows.map((row) => ({ ...row }));
  return rows.map((row) => {
    const out: TableRow = {};
    for (const item of items) {
      const { expression, alias } = splitAlias(item);
      const lagged = lagDifference(rows, row, expression);
      out[alias] = lagged === undefined ? valueExpression(row, expression) : lagged;
    }
    return out;
  });
}

function projectGroupedRows(rows: TableRow[], select: string, groupBy?: string): TableRow[] {
  const items = splitTopLevel(select);
  const selectAliases = new Map(items.map((item) => {
    const { expression, alias } = splitAlias(item);
    return [alias, expression] as const;
  }));
  const groupExpressions = groupBy ? splitTopLevel(groupBy).map((expr) => selectAliases.get(expr.trim()) ?? expr) : [];
  const groups = new Map<string, TableRow[]>();

  if (groupExpressions.length === 0) {
    groups.set("__all__", rows);
  } else {
    for (const row of rows) {
      const key = JSON.stringify(groupExpressions.map((expr) => valueExpression(row, expr)));
      const group = groups.get(key) ?? [];
      group.push(row);
      groups.set(key, group);
    }
  }

  return [...groups.values()].map((groupRows) => {
    const out: TableRow = {};
    for (const item of items) {
      const { expression, alias } = splitAlias(item);
      out[alias] = hasAggregate(expression) ? aggregateValue(groupRows, expression) : groupRows.length > 0 ? valueExpression(groupRows[0], expression) : null;
    }
    return out;
  });
}

function queryStoredData(sqlInput: unknown, apply: unknown, storeAs: unknown): Record<string, unknown> {
  const query = String(sqlInput ?? "").trim().replace(/;$/, "");
  if (!query) throw new Error("sql is required.");

  if (/^show\s+tables$/i.test(query)) {
    return { query, tables: [...tableStore.values()].map(({ rows: _rows, ...metadata }) => metadata) };
  }

  const describeMatch = query.match(/^describe\s+([A-Za-z_][A-Za-z0-9_]*)$/i);
  if (describeMatch) {
    const table = tableStore.get(describeMatch[1]);
    if (!table) throw new Error(`Unknown Massive table: ${describeMatch[1]}`);
    const { rows: _rows, ...metadata } = table;
    return { query, ...metadata, sampleRows: table.rows.slice(0, 5) };
  }

  const dropMatch = query.match(/^drop\s+table\s+([A-Za-z_][A-Za-z0-9_]*)$/i);
  if (dropMatch) {
    const dropped = tableStore.delete(dropMatch[1]);
    return { query, dropped: dropped ? dropMatch[1] : null };
  }

  const parsed = parseSelectSql(query);
  const table = tableStore.get(parsed.table);
  if (!table) throw new Error(`Unknown Massive table: ${parsed.table}`);
  let workingRows = parsed.where ? table.rows.filter((row) => conditionPass(row, parsed.where ?? "")) : [...table.rows];
  const aggregateMode = Boolean(parsed.groupBy) || splitTopLevel(parsed.select).some((item) => hasAggregate(splitAlias(item).expression));

  if (!aggregateMode) workingRows = sortRows(workingRows, parsed.orderBy);
  let resultRows = aggregateMode ? projectGroupedRows(workingRows, parsed.select, parsed.groupBy) : projectRows(workingRows, parsed.select);
  if (aggregateMode) resultRows = sortRows(resultRows, parsed.orderBy);
  if (parsed.limit !== undefined) resultRows = resultRows.slice(0, parsed.limit);

  const applied = applyFunctions(resultRows, apply);
  const stored = storeAs ? storeRows(storeAs, applied.rows, `Massive query: ${query.slice(0, 160)}`) : undefined;
  return {
    query,
    sourceTable: parsed.table,
    rowCount: applied.rows.length,
    returnedRows: Math.min(applied.rows.length, RESPONSE_ROW_LIMIT),
    rows: applied.rows.slice(0, RESPONSE_ROW_LIMIT),
    applied: applied.applied,
    metrics: applied.metrics,
    stored,
  };
}

function isoDate(daysAgo = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

async function fetchLlmsTxt(): Promise<string> {
  if (docsCache && Date.now() - docsCache.fetchedAt < DOC_CACHE_TTL_MS) return docsCache.text;
  const res = await fetch(llmsTxtUrl(), {
    headers: { Accept: "text/plain, text/markdown;q=0.9, */*;q=0.1" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Massive docs index returned HTTP ${res.status}`);
  const text = await res.text();
  docsCache = { text, fetchedAt: Date.now() };
  return text;
}

function scoreText(query: string, text: string): number {
  const lower = text.toLowerCase();
  const terms = query.toLowerCase().split(/[^a-z0-9._-]+/).filter((term) => term.length > 1);
  return terms.reduce((score, term) => score + (lower.includes(term) ? 1 : 0), 0);
}

function parseDocEntries(text: string): Array<{ title: string; url?: string; text: string }> {
  let section = "Massive REST docs";
  const entries: Array<{ title: string; url?: string; text: string }> = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      section = heading[1];
      continue;
    }
    const markdownLink = line.match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
    const bareUrl = line.match(/https?:\/\/\S+/);
    const url = markdownLink?.[2] ?? bareUrl?.[0]?.replace(/[),.;]+$/, "");
    if (url || line.toLowerCase().includes("stock") || line.toLowerCase().includes("ticker")) {
      entries.push({ title: markdownLink?.[1] ?? section, url, text: line });
    }
  }
  return entries;
}

async function fetchEndpointDocs(urlInput: unknown): Promise<Record<string, unknown>> {
  const raw = String(urlInput ?? "").trim();
  if (!raw) throw new Error("url is required");
  const url = raw.startsWith("/") ? new URL(raw, "https://massive.com") : new URL(raw);
  if (!["massive.com", "www.massive.com"].includes(url.hostname)) {
    throw new Error("Only massive.com documentation URLs are allowed.");
  }
  const res = await fetch(url, {
    headers: { Accept: "text/markdown, text/plain, text/html;q=0.8" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Massive docs URL returned HTTP ${res.status}`);
  const text = await res.text();
  return {
    url: url.toString(),
    contentType: res.headers.get("content-type") ?? "unknown",
    length: text.length,
    text: text.slice(0, 20_000),
    truncated: text.length > 20_000,
  };
}

export const MASSIVE_TOOLS: Array<[ToolDef, ToolHandler]> = [
  [
    {
      name: "massive_status",
      description: "[Massive] Show stock-data configuration, table limits, and MASSIVE_API_KEY readiness without revealing secrets.",
      inputSchema: { type: "object", properties: {} },
      category: "stocks",
    },
    async () => ({
      apiKeyConfigured: Boolean(process.env.MASSIVE_API_KEY),
      apiBaseUrl: apiBaseUrl(),
      docsIndexUrl: llmsTxtUrl(),
      maxTables: maxTables(),
      maxRowsPerTable: maxRows(),
      storedTables: [...tableStore.values()].map(({ rows: _rows, ...metadata }) => metadata),
      composableTools: [
        "massive_search_endpoints",
        "massive_get_endpoint_docs",
        "massive_call_api",
        "massive_query_data",
      ],
      stockTools: [
        "stock_aggregates",
        "stock_previous_close",
        "stock_snapshot",
        "stock_ticker_details",
        "stock_ticker_news",
        "stock_market_status",
      ],
      additionalCoverage: [
        "massive_labor_market",
        "generic Massive REST endpoints through massive_call_api",
      ],
      applyFunctions: BUILTIN_FUNCTIONS,
    }),
  ],
  [
    {
      name: "massive_search_endpoints",
      description: "[Massive] Search Massive REST endpoint docs and built-in financial functions by natural-language query. Use this before massive_call_api for unfamiliar endpoints.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query, for example 'AAPL aggregate bars' or 'stock snapshots'" },
          scope: { type: "string", enum: ["endpoints", "functions", "both"], description: "Search endpoint docs, built-in functions, or both. Default: both" },
          limit: { type: "number", description: "Maximum results. Default: 10" },
        },
        required: ["query"],
      },
      category: "stocks",
    },
    async (args) => {
      const query = String(args.query ?? "");
      const scope = String(args.scope ?? "both");
      const limit = Math.min(Math.max(Number(args.limit ?? 10), 1), 25);
      const results: Array<Record<string, unknown>> = [];

      if (scope === "both" || scope === "functions") {
        for (const fn of BUILTIN_FUNCTIONS) {
          const score = scoreText(query, fn);
          if (score > 0) results.push({ type: "function", score, name: fn });
        }
      }

      if (scope === "both" || scope === "endpoints") {
        const docsText = await fetchLlmsTxt();
        for (const entry of parseDocEntries(docsText)) {
          const score = scoreText(query, `${entry.title} ${entry.text}`);
          if (score > 0) results.push({ type: "endpoint", score, ...entry });
        }
      }

      return {
        query,
        scope,
        results: results.sort((a, b) => Number(b.score) - Number(a.score)).slice(0, limit),
      };
    },
  ],
  [
    {
      name: "massive_get_endpoint_docs",
      description: "[Massive] Fetch a Massive documentation page from a massive.com URL returned by massive_search_endpoints.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "A massive.com docs URL or path." },
        },
        required: ["url"],
      },
      category: "stocks",
    },
    async (args) => fetchEndpointDocs(args.url),
  ],
  [
    {
      name: "massive_call_api",
      description: "[Massive] Call any Massive REST API path with MASSIVE_API_KEY. Supports optional store_as and apply functions such as sma(close, 20).",
      inputSchema: {
        type: "object",
        properties: {
          method: { type: "string", enum: ["GET", "POST"], description: "HTTP method. Default: GET" },
          path: { type: "string", description: "API path beginning with '/', for example /v2/aggs/ticker/AAPL/prev" },
          params: { type: "object", description: "Query parameters for GET or JSON body for POST" },
          store_as: { type: "string", description: "Optional in-memory table name for response rows" },
          apply: { type: "string", description: "Optional apply expression, for example sma(close, 20)" },
          api_key: { type: "string", description: "Optional per-call key override. Prefer MASSIVE_API_KEY in the environment." },
        },
        required: ["path"],
      },
      category: "stocks",
    },
    async (args) => {
      const method = String(args.method ?? "GET").toUpperCase() === "POST" ? "POST" : "GET";
      const path = String(args.path ?? "");
      const data = await massiveApi(method, path, asPlainObject(args.params), args.api_key);
      return apiResponse(data, extractRows(data), args.apply, args.store_as, `Massive ${method} ${path}`);
    },
  ],
  [
    {
      name: "massive_query_data",
      description: "[Massive] Query stored Massive result tables. Supports SHOW TABLES, DESCRIBE, DROP TABLE, and SELECT with WHERE/GROUP BY/ORDER BY/LIMIT for common analysis workflows.",
      inputSchema: {
        type: "object",
        properties: {
          sql: { type: "string", description: "SQL-style query against stored tables, for example SELECT date, close FROM aapl_daily ORDER BY date DESC LIMIT 10" },
          apply: { type: "string", description: "Optional apply expression over query output, for example simple_return(close)" },
          store_as: { type: "string", description: "Optional table name for query output" },
        },
        required: ["sql"],
      },
      category: "stocks",
    },
    async (args) => queryStoredData(args.sql, args.apply, args.store_as),
  ],
  [
    {
      name: "massive_tables",
      description: "[Massive] List, describe, or drop in-memory Massive result tables created with store_as. Use massive_query_data for SELECT-style analysis.",
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list", "describe", "drop"], description: "Default: list" },
          table: { type: "string", description: "Table name for describe or drop" },
          sample: { type: "number", description: "Sample rows for describe. Default: 5" },
        },
      },
      category: "stocks",
    },
    async (args) => {
      const action = String(args.action ?? "list");
      if (action === "list") {
        return { tables: [...tableStore.values()].map(({ rows: _rows, ...metadata }) => metadata) };
      }

      const tableName = cleanTableName(args.table);
      const table = tableStore.get(tableName);
      if (!table) throw new Error(`Unknown Massive table: ${tableName}`);

      if (action === "drop") {
        tableStore.delete(tableName);
        return { dropped: tableName };
      }

      const sample = Math.min(Math.max(Number(args.sample ?? 5), 0), 50);
      const { rows: _rows, ...metadata } = table;
      return { ...metadata, sampleRows: table.rows.slice(0, sample) };
    },
  ],
  [
    {
      name: "stock_aggregates",
      description: "[Massive Stocks] Get historical OHLCV aggregate bars for a stock ticker. Defaults to the last 30 UTC days of daily bars.",
      inputSchema: {
        type: "object",
        properties: {
          ticker: { type: "string", description: "Stock ticker, for example AAPL" },
          multiplier: { type: "number", description: "Bar size multiplier. Default: 1" },
          timespan: { type: "string", enum: ["minute", "hour", "day", "week", "month", "quarter", "year"], description: "Bar timespan. Default: day" },
          from: { type: "string", description: "Start date YYYY-MM-DD. Default: 30 days ago" },
          to: { type: "string", description: "End date YYYY-MM-DD. Default: today" },
          adjusted: { type: "boolean", description: "Use split-adjusted bars. Default: true" },
          sort: { type: "string", enum: ["asc", "desc"], description: "Sort order. Default: asc" },
          limit: { type: "number", description: "Maximum bars. Default: 5000" },
          store_as: { type: "string", description: "Optional table name to store result rows" },
          apply: { type: "string", description: "Optional apply expression, for example sma(close, 20)" },
        },
        required: ["ticker"],
      },
      category: "stocks",
    },
    async (args) => {
      const ticker = cleanTicker(args.ticker);
      const multiplier = Math.max(1, Number(args.multiplier ?? 1));
      const timespan = String(args.timespan ?? "day");
      const from = String(args.from ?? isoDate(30));
      const to = String(args.to ?? isoDate());
      const path = `/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/${multiplier}/${encodeURIComponent(timespan)}/${encodeURIComponent(from)}/${encodeURIComponent(to)}`;
      const params = {
        adjusted: args.adjusted === undefined ? "true" : String(Boolean(args.adjusted)),
        sort: String(args.sort ?? "asc"),
        limit: Number(args.limit ?? 5000),
      };
      const data = await massiveApi("GET", path, params);
      return apiResponse(data, extractRows(data), args.apply, args.store_as, `Massive stock aggregates ${ticker}`);
    },
  ],
  [
    {
      name: "stock_previous_close",
      description: "[Massive Stocks] Get the previous close aggregate bar for a stock ticker.",
      inputSchema: {
        type: "object",
        properties: {
          ticker: { type: "string", description: "Stock ticker, for example AAPL" },
          adjusted: { type: "boolean", description: "Use split-adjusted data. Default: true" },
          store_as: { type: "string", description: "Optional table name to store result rows" },
        },
        required: ["ticker"],
      },
      category: "stocks",
    },
    async (args) => {
      const ticker = cleanTicker(args.ticker);
      const path = `/v2/aggs/ticker/${encodeURIComponent(ticker)}/prev`;
      const data = await massiveApi("GET", path, { adjusted: args.adjusted === undefined ? "true" : String(Boolean(args.adjusted)) });
      return apiResponse(data, extractRows(data), undefined, args.store_as, `Massive stock previous close ${ticker}`);
    },
  ],
  [
    {
      name: "stock_snapshot",
      description: "[Massive Stocks] Get the current stock snapshot for one ticker, including latest trade, quote, and daily bars when available on your plan.",
      inputSchema: {
        type: "object",
        properties: {
          ticker: { type: "string", description: "Stock ticker, for example AAPL" },
          store_as: { type: "string", description: "Optional table name to store the snapshot row" },
        },
        required: ["ticker"],
      },
      category: "stocks",
    },
    async (args) => {
      const ticker = cleanTicker(args.ticker);
      const path = `/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(ticker)}`;
      const data = await massiveApi("GET", path, {});
      return apiResponse(data, extractRows(data), undefined, args.store_as, `Massive stock snapshot ${ticker}`);
    },
  ],
  [
    {
      name: "stock_ticker_details",
      description: "[Massive Stocks] Get reference details for a stock ticker, such as name, exchange, market, locale, and active status.",
      inputSchema: {
        type: "object",
        properties: {
          ticker: { type: "string", description: "Stock ticker, for example AAPL" },
          date: { type: "string", description: "Optional as-of date YYYY-MM-DD" },
          store_as: { type: "string", description: "Optional table name to store the details row" },
        },
        required: ["ticker"],
      },
      category: "stocks",
    },
    async (args) => {
      const ticker = cleanTicker(args.ticker);
      const path = `/v3/reference/tickers/${encodeURIComponent(ticker)}`;
      const data = await massiveApi("GET", path, { date: args.date });
      return apiResponse(data, extractRows(data), undefined, args.store_as, `Massive stock ticker details ${ticker}`);
    },
  ],
  [
    {
      name: "stock_ticker_news",
      description: "[Massive Stocks] Get ticker news articles, including Massive insights/sentiment fields when available on your plan.",
      inputSchema: {
        type: "object",
        properties: {
          ticker: { type: "string", description: "Stock ticker, for example AAPL" },
          published_utc_gte: { type: "string", description: "Optional lower bound YYYY-MM-DD for published_utc.gte" },
          published_utc_lte: { type: "string", description: "Optional upper bound YYYY-MM-DD for published_utc.lte" },
          order: { type: "string", enum: ["asc", "desc"], description: "Sort order. Default: desc" },
          limit: { type: "number", description: "Maximum articles. Default: 100" },
          store_as: { type: "string", description: "Optional table name to store news rows" },
        },
        required: ["ticker"],
      },
      category: "stocks",
    },
    async (args) => {
      const ticker = cleanTicker(args.ticker);
      const params = {
        ticker,
        "published_utc.gte": args.published_utc_gte,
        "published_utc.lte": args.published_utc_lte,
        order: String(args.order ?? "desc"),
        limit: Number(args.limit ?? 100),
      };
      const data = await massiveApi("GET", "/v2/reference/news", params);
      return apiResponse(data, extractRows(data), undefined, args.store_as, `Massive ticker news ${ticker}`);
    },
  ],
  [
    {
      name: "stock_market_status",
      description: "[Massive Stocks] Get current U.S. market status and exchange status from Massive.",
      inputSchema: { type: "object", properties: {} },
      category: "stocks",
    },
    async () => {
      const data = await massiveApi("GET", "/v1/marketstatus/now", {});
      return { source: "Massive market status", data };
    },
  ],
  [
    {
      name: "massive_labor_market",
      description: "[Massive Economy] Get Fed labor market indicators: unemployment, participation, average hourly earnings, and job openings.",
      inputSchema: {
        type: "object",
        properties: {
          date: { type: "string", description: "Optional point-in-time date YYYY-MM-DD" },
          date_gte: { type: "string", description: "Optional lower bound YYYY-MM-DD for date.gte" },
          date_lte: { type: "string", description: "Optional upper bound YYYY-MM-DD for date.lte" },
          date_any_of: { type: "string", description: "Optional comma-separated dates for date.any_of" },
          sort: { type: "string", enum: ["date.asc", "date.desc"], description: "Sort order. Default: date.desc" },
          limit: { type: "number", description: "Maximum rows. Default: 100" },
          apply: { type: "string", description: "Optional apply expression over numeric series, for example simple_return(avg_hourly_earnings)" },
          store_as: { type: "string", description: "Optional table name to store labor-market rows" },
        },
      },
      category: "stocks",
    },
    async (args) => {
      const params = {
        date: args.date,
        "date.gte": args.date_gte,
        "date.lte": args.date_lte,
        "date.any_of": args.date_any_of,
        sort: String(args.sort ?? "date.desc"),
        limit: Number(args.limit ?? 100),
      };
      const data = await massiveApi("GET", "/fed/v1/labor-market", params);
      return apiResponse(data, extractRows(data), args.apply, args.store_as, "Massive labor market");
    },
  ],
];
