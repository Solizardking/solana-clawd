export interface SecretMatch {
  type: string;
  line: number;
  column: number;
  match: string;
  redacted: string;
  severity: "critical" | "high" | "medium";
  description: string;
}

export interface ScanResult {
  findings: SecretMatch[];
  scannedLines: number;
  clean: boolean;
}

const PATTERNS: Array<{
  name: string;
  regex: RegExp;
  severity: SecretMatch["severity"];
  description: string;
}> = [
  // Solana private keys — base58 encoded 64-byte keys (87-88 chars) or array notation
  {
    name: "Solana Private Key (base58)",
    regex: /\b([1-9A-HJ-NP-Za-km-z]{87,88})\b/g,
    severity: "critical",
    description: "Solana private key (base58-encoded)",
  },
  // Solana keypair as uint8 array [1,2,3,...] with 64 elements
  {
    name: "Solana Keypair Array",
    regex: /\[\s*(?:\d{1,3}\s*,\s*){63}\d{1,3}\s*\]/g,
    severity: "critical",
    description: "Solana keypair as byte array (64 bytes)",
  },
  // Ethereum/EVM private key
  {
    name: "Ethereum Private Key",
    regex: /(?:^|[^a-f0-9])(0x[a-fA-F0-9]{64})(?:[^a-f0-9]|$)/gm,
    severity: "critical",
    description: "Ethereum/EVM private key (hex 32 bytes)",
  },
  // PEM private key blocks
  {
    name: "PEM Private Key",
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    severity: "critical",
    description: "PEM-encoded private key block",
  },
  // AWS Access Key ID
  {
    name: "AWS Access Key ID",
    regex: /\b(AKIA[0-9A-Z]{16})\b/g,
    severity: "critical",
    description: "AWS Access Key ID",
  },
  // AWS Secret Access Key
  {
    name: "AWS Secret Access Key",
    regex: /(?:aws[_\-\s]?secret[_\-\s]?(?:access[_\-\s]?)?key|AWS_SECRET_ACCESS_KEY)\s*[=:]\s*["']?([A-Za-z0-9/+=]{40})["']?/gi,
    severity: "critical",
    description: "AWS Secret Access Key",
  },
  // GitHub tokens
  {
    name: "GitHub Token",
    regex: /\b(gh[pousr]_[A-Za-z0-9_]{36,255})\b/g,
    severity: "critical",
    description: "GitHub personal access / OAuth / app token",
  },
  // GitHub App private key (fine-grained)
  {
    name: "GitHub Fine-grained Token",
    regex: /\b(github_pat_[A-Za-z0-9_]{82})\b/g,
    severity: "critical",
    description: "GitHub fine-grained personal access token",
  },
  // XAI / OpenAI-compatible API keys
  {
    name: "XAI API Key",
    regex: /\b(xai-[A-Za-z0-9\-_]{20,})\b/g,
    severity: "critical",
    description: "xAI / Grok API key",
  },
  {
    name: "OpenAI API Key",
    regex: /\b(sk-(?:proj-|org-)?[A-Za-z0-9\-_T]{20,})\b/g,
    severity: "critical",
    description: "OpenAI API key",
  },
  // Anthropic API keys
  {
    name: "Anthropic API Key",
    regex: /\b(sk-ant-[A-Za-z0-9\-_]{20,})\b/g,
    severity: "critical",
    description: "Anthropic API key",
  },
  // Stripe keys
  {
    name: "Stripe Secret Key",
    regex: /\b(sk_live_[A-Za-z0-9]{24,})\b/g,
    severity: "critical",
    description: "Stripe live secret key",
  },
  {
    name: "Stripe Restricted Key",
    regex: /\b(rk_live_[A-Za-z0-9]{24,})\b/g,
    severity: "critical",
    description: "Stripe live restricted key",
  },
  // Google Cloud / Service Account
  {
    name: "Google Service Account Key",
    regex: /"private_key"\s*:\s*"-----BEGIN PRIVATE KEY/g,
    severity: "critical",
    description: "Google Cloud service account private key",
  },
  // Generic high-entropy API key assignments
  {
    name: "Generic API Key Assignment",
    regex: /(?:api[_\-]?key|apikey|access[_\-]?token|auth[_\-]?token|secret[_\-]?key|private[_\-]?key)\s*[=:]\s*["']([A-Za-z0-9\-_/+=.]{20,})["']/gi,
    severity: "high",
    description: "Generic API key or secret in assignment",
  },
  // Database connection strings with credentials
  {
    name: "Database URL with Password",
    regex: /(?:mongodb|postgresql|postgres|mysql|redis|amqp|rabbitmq|redis):\/\/[^:@\s]+:[^:@\s]+@[^\s"'`]+/gi,
    severity: "critical",
    description: "Database connection string containing password",
  },
  // JWT secrets
  {
    name: "JWT Secret Assignment",
    regex: /(?:jwt[_\-]?secret|jwt[_\-]?key|token[_\-]?secret)\s*[=:]\s*["']([^"']{16,})["']/gi,
    severity: "high",
    description: "JWT signing secret",
  },
  // Hardcoded passwords
  {
    name: "Hardcoded Password",
    regex: /(?:password|passwd|pwd)\s*[=:]\s*["']([^"']{8,})["']/gi,
    severity: "high",
    description: "Hardcoded password string",
  },
  // Mnemonic seed phrases (12 or 24 BIP39 words)
  {
    name: "Mnemonic Seed Phrase",
    regex: /\b(?:[a-z]{3,8}\s+){11}[a-z]{3,8}\b/g,
    severity: "critical",
    description: "Possible BIP39 mnemonic seed phrase (12 words)",
  },
  // Cloudflare API tokens
  {
    name: "Cloudflare API Token",
    regex: /\b([A-Za-z0-9\-_]{37}(?:AAA)[A-Za-z0-9\-_]{5,})\b/g,
    severity: "high",
    description: "Cloudflare API token",
  },
  // Slack tokens
  {
    name: "Slack Token",
    regex: /\b(xox[baprs]-[A-Za-z0-9\-]{10,})\b/g,
    severity: "high",
    description: "Slack Bot/App/User/Webhook token",
  },
  // Telegram bot tokens
  {
    name: "Telegram Bot Token",
    regex: /\b(\d{8,12}:[A-Za-z0-9\-_]{35})\b/g,
    severity: "high",
    description: "Telegram bot token",
  },
  // SSH private key
  {
    name: "SSH Private Key",
    regex: /-----BEGIN OPENSSH PRIVATE KEY-----/g,
    severity: "critical",
    description: "SSH private key (OpenSSH format)",
  },
  // .env file with actual values (not placeholders)
  {
    name: "ENV Secret Value",
    regex: /^(?!#)(?:PRIVATE_KEY|SECRET|API_KEY|TOKEN|PASSWORD|MNEMONIC|SEED)\s*=\s*(?!your[_\-]|<|{{|xxx|\$\{)[^\s]{8,}/gim,
    severity: "high",
    description: "Secret variable with non-placeholder value in .env file",
  },
];

// Lines to skip — test fixtures, examples, placeholders
const SAFE_LINE_PATTERNS = [
  /your[_\-]?(?:api[_\-]?)?key/i,
  /your[_\-]?(?:private[_\-]?)?secret/i,
  /placeholder/i,
  /example\.com/i,
  /replace[_\-]?me/i,
  /\$\{[^}]+\}/,   // template variable
  /\{\{[^}]+\}\}/,  // handlebars / mustache
  /process\.env\./,
  /os\.environ/,
  /getenv/i,
  /env\.get/i,
  /xxxx+/i,
  /test[_\-]?key/i,
  /fake[_\-]?key/i,
  /dummy/i,
  /mock/i,
];

function isSafeLine(line: string): boolean {
  return SAFE_LINE_PATTERNS.some((p) => p.test(line));
}

function redact(value: string): string {
  if (value.length <= 8) return "****";
  return value.slice(0, 4) + "****" + value.slice(-4);
}

export function scanDiff(diff: string): ScanResult {
  const findings: SecretMatch[] = [];
  const lines = diff.split("\n");
  let scannedLines = 0;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const raw = lines[lineIdx];

    // Only scan added lines in a diff (+), skip removed lines (-)
    if (!raw.startsWith("+")) continue;
    const line = raw.slice(1); // strip the leading +
    scannedLines++;

    if (isSafeLine(line)) continue;

    for (const pattern of PATTERNS) {
      pattern.regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.regex.exec(line)) !== null) {
        const captured = match[1] ?? match[0];
        // Skip very short captures that are likely false positives
        if (captured.length < 10 && pattern.severity !== "critical") continue;
        findings.push({
          type: pattern.name,
          line: lineIdx + 1,
          column: match.index + 1,
          match: captured,
          redacted: redact(captured),
          severity: pattern.severity,
          description: pattern.description,
        });
      }
    }
  }

  return {
    findings,
    scannedLines,
    clean: findings.length === 0,
  };
}

export function scanFileContent(content: string, filename: string): ScanResult {
  const findings: SecretMatch[] = [];
  const lines = content.split("\n");
  let scannedLines = 0;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    scannedLines++;

    if (isSafeLine(line)) continue;

    for (const pattern of PATTERNS) {
      pattern.regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.regex.exec(line)) !== null) {
        const captured = match[1] ?? match[0];
        if (captured.length < 10 && pattern.severity !== "critical") continue;
        findings.push({
          type: pattern.name,
          line: lineIdx + 1,
          column: match.index + 1,
          match: captured,
          redacted: redact(captured),
          severity: pattern.severity,
          description: pattern.description,
        });
      }
    }
  }

  return {
    findings,
    scannedLines,
    clean: findings.length === 0,
  };
}

export function formatFindingsForComment(
  results: Array<{ file: string; result: ScanResult }>
): string {
  const allFindings = results.flatMap((r) =>
    r.result.findings.map((f) => ({ ...f, file: r.file }))
  );

  if (allFindings.length === 0) return "";

  const criticalCount = allFindings.filter((f) => f.severity === "critical").length;
  const highCount = allFindings.filter((f) => f.severity === "high").length;

  const severityIcon = (s: string) =>
    s === "critical" ? "🚨" : s === "high" ? "⚠️" : "ℹ️";

  const rows = allFindings
    .map(
      (f) =>
        `| ${severityIcon(f.severity)} **${f.severity.toUpperCase()}** | \`${f.file}\` line ${f.line} | ${f.type} | \`${f.redacted}\` |`
    )
    .join("\n");

  return `## 🔐 Clawd Guard — Secret Scan Failed

**${criticalCount} critical** and **${highCount} high** severity findings detected in this PR diff.

> ⛔ Do **not** merge until these are resolved. If a secret was already pushed, rotate it immediately — Git history must be cleaned with \`git filter-repo\` or BFG.

| Severity | Location | Type | Redacted Value |
|----------|----------|------|----------------|
${rows}

### How to fix
1. Remove the secret from the file(s) above
2. Add to \`.gitignore\` / \`.env\` (and \`.env\` to \`.gitignore\`)
3. Use \`process.env.SECRET_NAME\` instead of hardcoded values
4. Run \`git filter-repo --invert-paths --path <file>\` if the secret was already committed
5. **Rotate the credential immediately** — treat it as compromised

---
*Powered by [Clawd Guard](https://github.com/openclawdsolana) + Grok AI · [Install on your repo](https://github.com/apps/clawd-guard)*`;
}
