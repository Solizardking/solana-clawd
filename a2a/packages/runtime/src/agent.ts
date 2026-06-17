import type { SvmA2ATask, SvmA2ATaskInput } from "./types.js";

export default class SvmA2AAgent {
  constructor(
    private readonly state?: unknown,
    private readonly env?: unknown
  ) {}

  async fetch(request: Request): Promise<Response> {
    if (request.method === "POST") {
      const input = await request.json() as SvmA2ATaskInput;
      return new Response(JSON.stringify(await this.handleTask(input)), {
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    return new Response(JSON.stringify({
      status: "healthy",
      runtime: "cloudflare-durable-object",
      state: Boolean(this.state),
      env: Boolean(this.env)
    }), {
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }

  async handleTask(input: SvmA2ATaskInput): Promise<SvmA2ATask> {
    const id = input.id ?? `svm-a2a-${Date.now()}`;
    const text = input.message.parts
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join("\n");

    return {
      id,
      status: {
        state: "completed",
        message: {
          role: "agent",
          parts: [
            {
              type: "text",
              text: `SVM-A2A task accepted for skill "${input.skill}".${text ? ` Input: ${text}` : ""}`
            }
          ]
        }
      },
      metadata: {
        protocol: "svm-a2a/0.1",
        settlement: "solana",
        trustGate: "delegated"
      }
    };
  }
}
