import type { SvmA2AAgentCard } from "./types";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export function buildSvmA2AAgentCard(baseUrl = "https://api.svm-a2a.ai"): SvmA2AAgentCard {
  return {
    name: "SVM-A2A Production Agent",
    description: "Solana-native agent-to-agent runtime with Metaplex Core identity and Clawd auth gates.",
    url: baseUrl,
    serviceEndpoint: baseUrl,
    version: "1.0.0",
    protocolVersion: "svm-a2a/0.1",
    capabilities: ["streaming", "pushNotifications", "a2a", "svm-settlement"],
    authentication: ["SIWS", "NFT-Ownership", "CLAWD-Tier"],
    skills: [
      {
        id: "research",
        name: "Research",
        description: "Run cited Solana market, protocol, and wallet research.",
        inputModes: ["text", "data"],
        outputModes: ["text", "data"]
      },
      {
        id: "trading",
        name: "Trading",
        description: "Prepare gated trading decisions with risk metadata for delegated execution.",
        inputModes: ["text", "data"],
        outputModes: ["data"]
      },
      {
        id: "ui-generation",
        name: "A2UI Generation",
        description: "Return dynamic UI artifacts for agent-to-agent workflows.",
        inputModes: ["text", "data"],
        outputModes: ["text", "data"]
      },
      {
        id: "mcp",
        name: "MCP Tool Routing",
        description: "Route agent requests to Clawd MCP skills and tools.",
        inputModes: ["text", "data"],
        outputModes: ["text", "data"]
      }
    ],
    svm: {
      chain: "solana",
      identity: {
        did: `${baseUrl}/.well-known/did.json`,
        registry: "metaplex-agent-registry"
      },
      payments: {
        protocols: ["x402", "solana-pay", "usdc"],
        settlementMint: USDC_MINT
      }
    }
  };
}
