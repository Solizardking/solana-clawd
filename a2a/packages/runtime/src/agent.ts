import type { SvmA2ATask, SvmA2ATaskInput } from "./types";

export default class SvmA2AAgent {
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
