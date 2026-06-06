export interface KnowledgeEntry {
  id: string;
  type: string;
  fact: string;
  recommendation: string;
  confidence: "high" | "medium" | "low";
  provenance: Array<{ source: string; reference: string; date: string }>;
  tags: string[];
  affectedFiles: string[];
  affectedServices: string[];
  createdAt: string;
  updatedAt: string;
  usageCount: number;
  helpfulCount: number;
  outdatedReports: number;
}

export interface ResearchResult {
  query: string;
  timestamp: string;
  findings: Array<{
    source: "birdeye" | "helius" | "knowledge" | "router";
    data: unknown;
  }>;
  loopId: string;
}

export interface RouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface RouterResponse {
  id: string;
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  model: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export interface LabsConfig {
  knowledgePath: string;
  routerUrl: string;
  routerModel?: string;
  birdeyeApiKey?: string;
  heliusApiKey?: string;
  autoloop: boolean;
  loopIntervalMs: number;
}
