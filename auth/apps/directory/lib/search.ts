import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { provider } from "@/lib/db/schema";
import type { ProviderConfig } from "@/lib/discover";
import { rankByIntent } from "@/lib/intent-search";
import { safeJsonParse } from "@/lib/utils";

export type ProviderSearchResult = ProviderConfig & {
  display_name: string;
  url: string;
  categories: string[];
  verified: boolean;
};

export interface SearchOptions {
  /** Max results to return after pagination. 1..50, defaults to 10. */
  limit?: number;
  /** Number of leading results to skip for pagination. Defaults to 0. */
  offset?: number;
}

export interface SearchResponse {
  results: ProviderSearchResult[];
  /** Total number of providers that scored above the relevance threshold. */
  total: number;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit ?? NaN)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit as number)));
}

function clampOffset(offset: number | undefined): number {
  if (!Number.isFinite(offset ?? NaN)) return 0;
  return Math.max(0, Math.trunc(offset as number));
}

type Searchable = Omit<typeof provider.$inferSelect, "categories"> & { categories: string[] };

function toResult(row: Searchable): ProviderSearchResult {
  return {
    version: row.version,
    provider_name: row.name,
    description: row.description,
    issuer: row.issuer,
    algorithms: safeJsonParse<string[]>(row.algorithms, []),
    modes: safeJsonParse<string[]>(row.modes, []),
    approval_methods: safeJsonParse<string[]>(row.approvalMethods, []),
    endpoints: safeJsonParse<Record<string, string>>(row.endpoints, {}),
    jwks_uri: row.jwksUri ?? undefined,
    display_name: row.displayName,
    url: row.url,
    categories: row.categories,
    verified: row.verified,
  };
}

export async function searchProvidersByIntent(
  intent: string,
  options: SearchOptions = {},
): Promise<SearchResponse> {
  const limit = clampLimit(options.limit);
  const offset = clampOffset(options.offset);

  const rows = await db
    .select()
    .from(provider)
    .where(and(eq(provider.status, "active"), eq(provider.public, true)));

  const searchable: Searchable[] = rows.map((row) => ({
    ...row,
    categories: safeJsonParse<string[]>(row.categories, []),
  }));

  const ranked = await rankByIntent(searchable, intent);
  const total = ranked.length;
  const page = ranked.slice(offset, offset + limit);

  return { results: page.map(toResult), total };
}
