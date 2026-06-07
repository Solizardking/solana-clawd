import OpenAI from "openai";

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) throw new Error("XAI_API_KEY environment variable is required");
    _client = new OpenAI({
      apiKey,
      baseURL: "https://api.x.ai/v1",
    });
  }
  return _client;
}

export interface GrokAnalysis {
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

const SYSTEM_PROMPT = `You are Clawd Guard, a security expert AI that detects exposed secrets, private keys, and credentials in code diffs.

Your job is to analyze a GitHub PR diff and identify any secrets that should NOT be committed:
- Private keys (Solana base58, Ethereum hex, RSA/EC PEM)
- API keys (any provider)
- Passwords and tokens
- Database URLs with credentials
- Mnemonic seed phrases
- Environment variable values (not references to env vars, but actual hardcoded values)

IMPORTANT rules:
- Only flag ACTUAL secrets, not references like process.env.SECRET or placeholder text like "your-api-key-here"
- Template variables like {{SECRET}} or ${SECRET} are safe
- Test fixtures with obviously fake values (like "test123" or "abc123") are generally safe unless they look like real keys
- Base58-encoded strings of 87-88 chars are very likely Solana private keys
- Array notation with 64 uint8 numbers is a Solana keypair

Respond with valid JSON only, no markdown, no explanation outside the JSON.`;

export async function analyzeWithGrok(
  diff: string,
  filename: string
): Promise<GrokAnalysis> {
  const client = getClient();

  const truncatedDiff = diff.length > 8000 ? diff.slice(0, 8000) + "\n[...truncated]" : diff;

  try {
    const response = await client.chat.completions.create({
      model: "grok-3-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Analyze this diff from file "${filename}" for exposed secrets:\n\n\`\`\`diff\n${truncatedDiff}\n\`\`\`\n\nRespond with JSON matching this schema:\n{\n  "hasSecrets": boolean,\n  "confidence": "high" | "medium" | "low",\n  "findings": [{"type": string, "description": string, "line": number | null, "suggestion": string}],\n  "summary": string\n}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 1024,
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as GrokAnalysis;
    return parsed;
  } catch (err) {
    // If Grok is unavailable, return a neutral result rather than failing the check
    console.error("[clawd-guard] Grok analysis failed:", err);
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
): Promise<Map<string, GrokAnalysis>> {
  const results = new Map<string, GrokAnalysis>();

  // Only send files with non-trivial patches to Grok to save tokens
  const filesToAnalyze = files.filter(
    (f) => f.patch && f.patch.length > 50
  );

  await Promise.allSettled(
    filesToAnalyze.map(async (file) => {
      if (!file.patch) return;
      const analysis = await analyzeWithGrok(file.patch, file.filename);
      results.set(file.filename, analysis);
    })
  );

  return results;
}

export function formatGrokFindings(analyses: Map<string, GrokAnalysis>): string {
  const allFindings: Array<{ file: string; finding: GrokAnalysis["findings"][0] }> = [];

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

  return `\n### 🤖 Grok AI Additional Findings\n\n| Location | Type | Description |\n|----------|------|-------------|\n${rows}\n`;
}
