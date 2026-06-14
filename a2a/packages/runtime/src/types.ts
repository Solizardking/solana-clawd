export interface SvmA2ASkill {
  id: string;
  name: string;
  description: string;
  inputModes?: string[];
  outputModes?: string[];
}

export interface SvmA2AAgentCard {
  name: string;
  description: string;
  url: string;
  serviceEndpoint: string;
  version: string;
  protocolVersion: string;
  capabilities: string[];
  authentication: string[];
  skills: SvmA2ASkill[];
  svm: {
    chain: "solana";
    identity: {
      did?: string;
      mplCoreAsset?: string;
      sasAttestation?: string;
      registry?: string;
    };
    payments: {
      protocols: Array<"x402" | "solana-pay" | "usdc">;
      settlementMint: string;
    };
  };
}

export interface SvmA2ATaskInput {
  id?: string;
  skill: string;
  message: {
    role: "user";
    parts: Array<{ type: "text"; text: string } | { type: "data"; data: Record<string, unknown> }>;
  };
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface SvmA2ATask {
  id: string;
  status: {
    state: "submitted" | "working" | "completed" | "failed" | "cancelled";
    message?: {
      role: "agent";
      parts: Array<{ type: "text"; text: string } | { type: "data"; data: Record<string, unknown> }>;
    };
    error?: { code: string; message: string };
  };
  artifacts?: Array<{
    name: string;
    mimeType: string;
    parts: Array<{ type: "text"; text: string }>;
  }>;
  metadata?: Record<string, unknown>;
}
