export function isDangerousVulcanMCPTool(toolName: string): boolean {
  if (!toolName.startsWith("mcp__vulcan__")) return false;

  const vulcanTool = toolName.replace("mcp__vulcan__", "");
  const dangerousPatterns = [
    /^trade($|_)/,
    /^position_(close|reduce|manage|update)/,
    /^margin_(deposit|withdraw|transfer|borrow|repay|set|update)/,
    /^strategy_.*_(start|resume|finalize|execute)/,
    /^strategy_(start|resume|finalize|execute)/,
    /^twap_(start|resume|execute)/,
    /^grid_(start|resume|execute)/,
    /^tpsl_(set|update|cancel|create)/,
    /^conditional_orders_(place|cancel|update)/,
    /^order_(place|cancel|update)/,
    /^wallet_(create|import|export|set|delete)/,
  ];

  return dangerousPatterns.some((pattern) => pattern.test(vulcanTool));
}

export function summarizeVulcanArgs(args: unknown): string {
  const redacted = redactSensitiveValues(args);
  const summary = JSON.stringify(redacted);
  return summary.length > 500 ? `${summary.slice(0, 497)}...` : summary;
}

export function redactSensitiveValues(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveValues(item));
  }

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (/(password|private|secret|keypair|token|credential|signature|auth)/i.test(key)) {
        out[key] = "[redacted]";
      } else {
        out[key] = redactSensitiveValues(nested);
      }
    }
    return out;
  }

  return value;
}
