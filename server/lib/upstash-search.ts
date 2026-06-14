import { Search } from "@upstash/search";

const url = (process.env.UPSTASH_SEARCH_REST_URL ?? "").trim();
const token = (process.env.UPSTASH_SEARCH_REST_TOKEN ?? "").trim();

if (!url || !token) {
  console.warn("[upstash-search] WARNING: UPSTASH_SEARCH_REST_URL or UPSTASH_SEARCH_REST_TOKEN not set — search features disabled");
}

export const searchClient = url && token ? new Search({ url, token }) : null;

export type AgentContent = {
  name: string;
  persona: string;
  greeting?: string;
  provider: string;
  model: string;
};

export type AgentMetadata = {
  ownerWallet: string;
  slug: string;
  status: string;
  avatarUrl?: string;
  sourceAgentId?: string;
  launchRuntime?: string;
};

export type SavedItemContent = {
  title: string;
  description?: string;
  kind: string;
  source?: string;
};

export type SavedItemMetadata = {
  userId: number;
  r2Key: string;
  thumbnailUrl?: string;
  isPublic: boolean;
};

export const agentsIndex = searchClient?.index<AgentContent, AgentMetadata>("agents") ?? null;
export const savedItemsIndex = searchClient?.index<SavedItemContent, SavedItemMetadata>("saved-items") ?? null;
