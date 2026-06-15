import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY environment variable is required");
    _client = new Anthropic({
      baseURL: "https://api.inference.net",
      apiKey: null,
      authToken: process.env.INFERENCE_API_KEY,
      defaultHeaders: {
        "x-inference-provider": "anthropic",
        "x-inference-provider-api-key": apiKey,
        "x-inference-environment": "production",
      },
    });
  }
  return _client;
}

export interface ClaudeAnalysis {
  hasSecrets: boolean;
  confidence: "high" | "medium" | "low";
  findings: Array<{
    type: string;
    description: string;
    line?: number;
    suggestion: string;
  }>;
  summary: string;
}

const SYSTEM_PROMPT = `You are Clawd Guard, a security-focused AI built on Claude Opus. Your sole job is detecting exposed secrets, private keys, and credentials in code diffs before they reach production.

Identify anything that should NOT be committed:
- Private keys: Solana base58 (87–88 chars), Ethereum hex (0x + 64 hex chars), RSA/EC/OpenSSH PEM blocks, uint8 array keypairs (64 numbers)
- API keys: any provider (Anthropic, OpenAI, XAI, Stripe, AWS, GitHub, Helius, etc.)
- Passwords, bearer tokens, session secrets
- Database/connection URLs containing credentials
- Mnemonic seed phrases (12 or 24 BIP-39 words)
- Hardcoded env var VALUES (not references like process.env.SECRET)

Rules:
- Do NOT flag: process.env references, template variables {{SECRET}} or \${VAR}, obvious placeholders ("your-api-key-here", "xxx", "test123"), comments describing secret formats
- DO flag: actual key material, real-looking tokens, anything that would be dangerous if public
- Base58 strings of 87–88 chars are very likely Solana private keys
- JSON arrays of exactly 64 uint8 integers are Solana keypairs

Respond with valid JSON only — no markdown fences, no preamble outside the JSON object.`;

export async function analyzeWithClaude(
  diff: string,
  filename: string
): Promise<ClaudeAnalysis> {
  const client = getClient();

  const truncatedDiff = diff.length > 12000 ? diff.slice(0, 12000) + "\n[...truncated]" : diff;

  try {
    const message = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Analyze this diff from file "${filename}" for exposed secrets.\n\n\`\`\`diff\n${truncatedDiff}\n\`\`\`\n\nRespond with JSON matching exactly:\n{\n  "hasSecrets": boolean,\n  "confidence": "high" | "medium" | "low",\n  "findings": [{"type": string, "description": string, "line": number | null, "suggestion": string}],\n  "summary": string\n}`,
        },
      ],
    }, {
      headers: { "x-inference-task-id": "secret-scan" },
    });

    const content = message.content[0];
    if (content.type !== "text") throw new Error("Unexpected response type");

    return JSON.parse(content.text) as ClaudeAnalysis;
  } catch (err) {
    console.error("[clawd-guard] Claude analysis failed:", err);
    return {
      hasSecrets: false,
      confidence: "low",
      findings: [],
      summary: "AI analysis unavailable — regex scan only",
    };
  }
}

export async function analyzeFullDiff(
  files: Array<{ filename: string; patch?: string }>
): Promise<Map<string, ClaudeAnalysis>> {
  const results = new Map<string, ClaudeAnalysis>();

  const filesToAnalyze = files.filter((f) => f.patch && f.patch.length > 50);

  await Promise.allSettled(
    filesToAnalyze.map(async (file) => {
      if (!file.patch) return;
      const analysis = await analyzeWithClaude(file.patch, file.filename);
      results.set(file.filename, analysis);
    })
  );

  return results;
}

export function formatClaudeFindings(analyses: Map<string, ClaudeAnalysis>): string {
  const allFindings: Array<{ file: string; finding: ClaudeAnalysis["findings"][0] }> = [];

  for (const [file, analysis] of analyses) {
    if (!analysis.hasSecrets || analysis.confidence === "low") continue;
    for (const finding of analysis.findings) {
      allFindings.push({ file, finding });
    }
  }

  if (allFindings.length === 0) return "";

  const rows = allFindings
    .map(
      (f) =>
        `| \`${f.file}\`${f.finding.line ? ` line ${f.finding.line}` : ""} | ${f.finding.type} | ${f.finding.description} |`
    )
    .join("\n");

  return `\n### 🤖 Claude Opus Analysis\n\n| Location | Type | Description |\n|----------|------|-------------|\n${rows}\n`;
}
