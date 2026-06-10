import type { SolanaPaperWallet } from "./paper-wallet";

export interface DarkClawdAgentConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
}

export interface DarkClawdReviewContext {
  label: string;
  network: string;
  publicKey: string;
  publicFingerprint: string;
  seedFingerprint: string;
  paymentRail: string;
  settlement: string;
  durable: boolean;
  proofLayer: string;
  prompt?: string;
}

const DEFAULT_BASE_URL = "https://api.x.ai/v1";
const DEFAULT_MODEL = "grok-4.20-beta-latest-non-reasoning";

function buildReviewPrompt(context: DarkClawdReviewContext): string {
  return [
    "You are Dark Clawd, the wallet-side agent for a Solana paper wallet.",
    "Do not request, repeat, or infer the secret key. Review only the public metadata and operational posture.",
    "Keep the response concise and practical.",
    "",
    `Wallet label: ${context.label}`,
    `Network: ${context.network}`,
    `Public key: ${context.publicKey}`,
    `Public fingerprint: ${context.publicFingerprint}`,
    `Seed fingerprint: ${context.seedFingerprint}`,
    `Payment rail: ${context.paymentRail}`,
    `Settlement: ${context.settlement}`,
    `Durable settlement: ${context.durable ? "yes" : "no"}`,
    `Proof layer: ${context.proofLayer}`,
    context.prompt ? `Operator note: ${context.prompt}` : "",
    "",
    "Return:",
    "1. A short risk summary.",
    "2. Any operational cautions for printing, storage, and transport.",
    "3. A recommendation on whether the wallet is ready for cold storage.",
  ]
    .filter(Boolean)
    .join("\n");
}

export class DarkClawdAgent {
  constructor(private readonly config: DarkClawdAgentConfig) {}

  get available(): boolean {
    return Boolean(this.config.apiKey.trim());
  }

  async chat(prompt: string, systemPrompt?: string): Promise<string> {
    const response = await fetch(`${this.config.baseUrl ?? DEFAULT_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model ?? DEFAULT_MODEL,
        temperature: this.config.temperature ?? 0.2,
        messages: [
          ...(systemPrompt
            ? [{ role: "system", content: systemPrompt }]
            : []),
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`xAI request failed (${response.status}): ${await response.text()}`);
    }

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return payload.choices?.[0]?.message?.content?.trim() || "";
  }

  async reviewPaperWallet(context: DarkClawdReviewContext): Promise<string> {
    return this.chat(buildReviewPrompt(context));
  }

  async reviewWallet(wallet: SolanaPaperWallet, context?: Partial<DarkClawdReviewContext>): Promise<string> {
    return this.reviewPaperWallet({
      label: wallet.label,
      network: wallet.network,
      publicKey: wallet.publicKey,
      publicFingerprint: wallet.publicFingerprint,
      seedFingerprint: wallet.seedFingerprint,
      paymentRail: context?.paymentRail ?? "x402",
      settlement: context?.settlement ?? "solana",
      durable: context?.durable ?? true,
      proofLayer: context?.proofLayer ?? "evm",
      prompt: context?.prompt,
    });
  }
}

export function createDarkClawdAgent(apiKey?: string, config?: Omit<DarkClawdAgentConfig, "apiKey">): DarkClawdAgent | null {
  if (!apiKey?.trim()) {
    return null;
  }

  return new DarkClawdAgent({
    apiKey,
    baseUrl: config?.baseUrl,
    model: config?.model,
    temperature: config?.temperature,
  });
}
