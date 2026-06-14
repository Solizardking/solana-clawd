// Natural language parser for wallet/token commands
// Returns structured intent objects for the TokenOpsPanel

export type ParsedIntent =
  | { intent: "BURN";     token: string; amount: number | "all"; percent?: number }
  | { intent: "TRANSFER"; token: string; amount: number; to: string }
  | { intent: "SWAP";     fromToken: string; toToken: string; amount: number }
  | { intent: "LOCK";     token: string; amount: number | "all"; durationSeconds: number; durationLabel: string }
  | { intent: "BALANCE" }
  | { intent: "LAUNCH";   concept: string }
  | { intent: "UNKNOWN";  raw: string }
  | { intent: "HELP" };

const SOL_SYNONYMS = ["sol", "solana"];
const CLAWD_SYNONYMS = ["clawd", "$clawd"];
const AMOUNT = "([\\d,]+(?:\\.\\d+)?|\\.\\d+)";
const TOKEN = "([A-Za-z0-9$]{2,44})";
const NUMBER_WORDS: Record<string, string> = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
};

function resolveSymbol(s: string): string {
  const lower = s.toLowerCase().replace(/^\$/, "");
  if (SOL_SYNONYMS.includes(lower)) return "SOL";
  if (CLAWD_SYNONYMS.includes(lower)) return "CLAWD";
  return s.toUpperCase().replace(/^\$/, "");
}

function parseAmount(s: string): number | "all" {
  if (!s || s.toLowerCase() === "all" || s.toLowerCase() === "everything" || s.toLowerCase() === "entire") return "all";
  const n = parseFloat(normalizeAmount(s));
  return isNaN(n) ? "all" : n;
}

function normalizeAmount(s: string): string {
  return s.replace(/,/g, "").replace(/^\./, "0.");
}

function parseNumber(s: string): number {
  return parseFloat(normalizeAmount(s));
}

function normalizeCommand(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\bpoint\s+(zero|one|two|three|four|five|six|seven|eight|nine)\b/gi, (_, n: string) => `0.${NUMBER_WORDS[n.toLowerCase()]}`)
    .replace(/\bzero\s+point\s+(zero|one|two|three|four|five|six|seven|eight|nine)\b/gi, (_, n: string) => `0.${NUMBER_WORDS[n.toLowerCase()]}`)
    .replace(/\bzero\s+point\s+(\d+)/gi, "0.$1")
    .replace(/\bpoint\s+(\d+)/gi, "0.$1")
    .replace(/\bhalf\s+(?:a\s+)?sol\b/gi, "0.5 SOL")
    .replace(/\ba quarter\s+(?:of\s+a\s+)?sol\b/gi, "0.25 SOL")
    .replace(/\bone\s+sol\b/gi, "1 SOL");
}

function parseDuration(amount: string, unit: string): { seconds: number; label: string } {
  const n = parseFloat(amount) || 1;
  const u = unit?.toLowerCase() || "days";
  if (u.startsWith("min")) return { seconds: n * 60, label: `${n} minute${n > 1 ? "s" : ""}` };
  if (u.startsWith("hour")) return { seconds: n * 3600, label: `${n} hour${n > 1 ? "s" : ""}` };
  if (u.startsWith("day")) return { seconds: n * 86400, label: `${n} day${n > 1 ? "s" : ""}` };
  if (u.startsWith("week")) return { seconds: n * 604800, label: `${n} week${n > 1 ? "s" : ""}` };
  if (u.startsWith("month")) return { seconds: n * 2592000, label: `${n} month${n > 1 ? "s" : ""}` };
  return { seconds: n * 86400, label: `${n} day${n > 1 ? "s" : ""}` };
}

// ─── Regex patterns ───────────────────────────────────────────────────────────
const PATTERNS: Array<{
  regex: RegExp;
  parse: (m: RegExpMatchArray) => ParsedIntent;
}> = [
  // help
  {
    regex: /^help|^what can (i|you) do|^commands/i,
    parse: () => ({ intent: "HELP" }),
  },

  // balance
  {
    regex: /(?:check|show|what(?:'s| is)?|display|get|see)\s+(?:my\s+)?(?:balance|portfolio|wallet|tokens?|holdings?)/i,
    parse: () => ({ intent: "BALANCE" }),
  },
  {
    regex: /^balance$|^portfolio$|^my wallet$/i,
    parse: () => ({ intent: "BALANCE" }),
  },

  // burn - "burn all BONK", "burn 500 CLAWD", "burn 50% of SOL"
  {
    regex: /burn\s+(\d+(?:\.\d+)?)\s*%\s+(?:of\s+)?([A-Za-z0-9$]{2,44})/i,
    parse: (m) => ({ intent: "BURN", token: resolveSymbol(m[2]), amount: parseFloat(m[1]) / 100, percent: parseFloat(m[1]) }),
  },
  {
    regex: /burn\s+(all|everything|entire)\s+(?:my\s+)?([A-Za-z0-9$]{2,44})/i,
    parse: (m) => ({ intent: "BURN", token: resolveSymbol(m[2]), amount: "all" }),
  },
  {
    regex: /burn\s+([\d,]+(?:\.\d+)?)\s+([A-Za-z0-9$]{2,44})/i,
    parse: (m) => ({ intent: "BURN", token: resolveSymbol(m[2]), amount: parseFloat(m[1].replace(/,/g, "")) }),
  },
  {
    regex: /destroy\s+([\d,]+(?:\.\d+)?)\s+([A-Za-z0-9$]{2,44})/i,
    parse: (m) => ({ intent: "BURN", token: resolveSymbol(m[2]), amount: parseFloat(m[1].replace(/,/g, "")) }),
  },

  // transfer / send - "send 1 SOL to <addr>", "transfer 500 USDC to <addr>"
  {
    regex: /(?:send|transfer)\s+([\d,]+(?:\.\d+)?)\s+([A-Za-z0-9$]{2,44})\s+to\s+([1-9A-HJ-NP-Za-km-z]{32,44})/i,
    parse: (m) => ({ intent: "TRANSFER", token: resolveSymbol(m[2]), amount: parseFloat(m[1].replace(/,/g, "")), to: m[3] }),
  },
  {
    regex: /(?:send|transfer)\s+([\d,]+(?:\.\d+)?)\s+([A-Za-z0-9$]{2,44})\s+to\s+(\S+)/i,
    parse: (m) => ({ intent: "TRANSFER", token: resolveSymbol(m[2]), amount: parseFloat(m[1].replace(/,/g, "")), to: m[3] }),
  },

  // swap / buy / sell
  // "swap 1 SOL for BONK", "buy 0.5 SOL of CLAWD", "ape .1 SOL into CLAWD", "sell 100 CLAWD"
  {
    regex: new RegExp(`(?:swap|exchange|convert|trade)\\s+${AMOUNT}\\s+${TOKEN}\\s+(?:for|to|into|over\\s+to)\\s+${TOKEN}`, "i"),
    parse: (m) => ({ intent: "SWAP", fromToken: resolveSymbol(m[2]), toToken: resolveSymbol(m[3]), amount: parseNumber(m[1]) }),
  },
  {
    regex: new RegExp(`(?:buy|grab|cop|ape\\s+into|long|market\\s+buy)\\s+${AMOUNT}\\s*(?:sol(?:ana)?\\s+(?:(?:worth\\s+of|worth|of|into|for)\\s*)?)${TOKEN}`, "i"),
    parse: (m) => ({ intent: "SWAP", fromToken: "SOL", toToken: resolveSymbol(m[2]), amount: parseNumber(m[1]) }),
  },
  {
    regex: new RegExp(`(?:buy|get|grab|cop|ape\\s+into|long|market\\s+buy)\\s+${TOKEN}\\s+(?:with|using|for)\\s+${AMOUNT}\\s+${TOKEN}`, "i"),
    parse: (m) => ({ intent: "SWAP", fromToken: resolveSymbol(m[3]), toToken: resolveSymbol(m[1]), amount: parseNumber(m[2]) }),
  },
  {
    regex: new RegExp(`(?:sell|dump|exit|market\\s+sell)\\s+${AMOUNT}\\s+${TOKEN}\\s+(?:for|to|into)\\s+${TOKEN}`, "i"),
    parse: (m) => ({ intent: "SWAP", fromToken: resolveSymbol(m[2]), toToken: resolveSymbol(m[3]), amount: parseNumber(m[1]) }),
  },
  {
    regex: new RegExp(`(?:sell|dump|exit|market\\s+sell)\\s+${AMOUNT}\\s+${TOKEN}`, "i"),
    parse: (m) => ({ intent: "SWAP", fromToken: resolveSymbol(m[2]), toToken: "SOL", amount: parseNumber(m[1]) }),
  },
  {
    regex: new RegExp(`(?:swap|exchange|convert|trade)\\s+${AMOUNT}\\s+${TOKEN}$`, "i"),
    parse: (m) => ({ intent: "SWAP", fromToken: "SOL", toToken: resolveSymbol(m[2]), amount: parseNumber(m[1]) }),
  },

  // lock / freeze / stake
  // "lock 1000 CLAWD for 30 days", "lock all SOL for 1 week"
  {
    regex: /(?:lock|freeze|stake)\s+(all|[\d,]+(?:\.\d+)?)\s+([A-Za-z0-9$]{2,44})\s+(?:for|during)\s+([\d.]+)\s+(minute|hour|day|week|month)s?/i,
    parse: (m) => {
      const dur = parseDuration(m[3], m[4]);
      const amt = m[1].toLowerCase() === "all" ? "all" : parseFloat(m[1].replace(/,/g, ""));
      return { intent: "LOCK", token: resolveSymbol(m[2]), amount: amt, durationSeconds: dur.seconds, durationLabel: dur.label };
    },
  },

  // launch / create token
  {
    regex: /(?:launch|create|make|mint)\s+(?:a\s+)?(?:new\s+)?token\s+(?:called\s+|named\s+)?(.+)/i,
    parse: (m) => ({ intent: "LAUNCH", concept: m[1].trim() }),
  },
  {
    regex: /(?:launch|create)\s+(.+)\s+(?:token|coin|meme)/i,
    parse: (m) => ({ intent: "LAUNCH", concept: m[1].trim() }),
  },
];

// ─── Main parse function ──────────────────────────────────────────────────────
export function parseCommand(input: string): ParsedIntent {
  const clean = normalizeCommand(input);
  for (const { regex, parse } of PATTERNS) {
    const match = clean.match(regex);
    if (match) return parse(match);
  }
  return { intent: "UNKNOWN", raw: clean };
}

// ─── AI fallback parse ────────────────────────────────────────────────────────
export async function parseCommandWithAI(input: string): Promise<ParsedIntent> {
  const local = parseCommand(input);
  if (local.intent !== "UNKNOWN") return local;

  try {
    const r = await fetch("/api/wallet-ops/parse-command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: input }),
    });
    const data = await r.json();
    if (data.intent && data.intent !== "UNKNOWN") {
      // Map AI response to ParsedIntent
      const p = data.params || {};
      switch (data.intent) {
        case "BURN":     return { intent: "BURN", token: p.token || "", amount: p.amount ?? "all" };
        case "TRANSFER": return { intent: "TRANSFER", token: p.token || "SOL", amount: p.amount || 0, to: p.to || "" };
        case "SWAP":     return { intent: "SWAP", fromToken: p.fromToken || "SOL", toToken: p.toToken || "", amount: p.amount || 0 };
        case "LOCK":     {
          const dur = parseDuration(String(p.duration || 1), p.unit || "days");
          return { intent: "LOCK", token: p.token || "", amount: p.amount ?? "all", durationSeconds: dur.seconds, durationLabel: dur.label };
        }
        case "BALANCE":  return { intent: "BALANCE" };
        case "LAUNCH":   return { intent: "LAUNCH", concept: p.concept || input };
        case "HELP":     return { intent: "HELP" };
      }
    }
  } catch {}
  return { intent: "UNKNOWN", raw: input };
}

export const HELP_TEXT = `
Available commands:
  balance / portfolio         — show your wallet balances
  burn <amount> <TOKEN>       — burn/destroy tokens
  burn all <TOKEN>            — burn entire balance
  burn <N>% of <TOKEN>        — burn a percentage
  send <amount> <TOKEN> to <address>   — transfer tokens
  swap <amount> <FROM> for <TO>        — swap via Jupiter
  buy <amount> SOL of <TOKEN>          — buy token with SOL
  sell <amount> <TOKEN> for SOL        — sell token for SOL
  ape/long/grab <amount> SOL into <TOKEN> — natural buy phrases
  dump/exit <amount> <TOKEN>           — natural sell phrases
  lock <amount> <TOKEN> for <N> days   — lock tokens via StreamFlow
  launch <concept> token      — generate & launch meme token
  help                        — show this help
`.trim();
