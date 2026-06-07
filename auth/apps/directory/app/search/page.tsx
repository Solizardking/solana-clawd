import Link from "next/link";
import { Nav } from "@/components/nav";
import { ProviderCard } from "@/components/provider-card";
import { SearchBar } from "@/components/search-bar";
import { searchProvidersByIntent } from "@/lib/search";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;

function buildPageHref(q: string, page: number): string {
  const params = new URLSearchParams({ q });
  if (page > 1) params.set("page", String(page));
  return `/search?${params.toString()}`;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page: pageParam } = await searchParams;
  const intent = q?.trim() ?? "";
  const page = Math.max(1, Number(pageParam ?? "1") || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const { results, total } = intent
    ? await searchProvidersByIntent(intent, { limit: PAGE_SIZE, offset })
    : { results: [], total: 0 };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-dvh flex flex-col">
      <Nav />

      <div className="border-b border-foreground/[0.06] px-4 sm:px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <SearchBar defaultValue={intent} autoFocus />
        </div>
      </div>

      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-8">
        {intent && (
          <div className="mb-6">
            <p className="text-[11px] font-mono text-foreground/40">
              {total} result{total !== 1 && "s"} for intent &ldquo;{intent}&rdquo;
              {totalPages > 1 && (
                <span className="text-foreground/25">
                  {" — "}page {page} of {totalPages}
                </span>
              )}
            </p>
          </div>
        )}

        {results.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {results.map((p) => (
                <ProviderCard
                  key={p.provider_name}
                  name={p.provider_name}
                  displayName={p.display_name ?? p.provider_name}
                  description={p.description ?? ""}
                  categories={p.categories ?? []}
                  verified={p.verified ?? false}
                  modes={p.modes}
                  url={p.url ?? p.issuer}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-10">
                {page > 1 && (
                  <Link
                    href={buildPageHref(intent, page - 1)}
                    className="text-[11px] font-mono text-foreground/45 hover:text-foreground/70 border border-foreground/[0.08] px-3 py-1.5 transition-colors"
                  >
                    ← Prev
                  </Link>
                )}
                <span className="text-[11px] font-mono text-foreground/30 px-2">
                  {page} / {totalPages}
                </span>
                {page < totalPages && (
                  <Link
                    href={buildPageHref(intent, page + 1)}
                    className="text-[11px] font-mono text-foreground/45 hover:text-foreground/70 border border-foreground/[0.08] px-3 py-1.5 transition-colors"
                  >
                    Next →
                  </Link>
                )}
              </div>
            )}
          </>
        ) : intent ? (
          <div className="text-center py-16 space-y-3">
            <p className="text-sm text-foreground/40">
              {page > 1 ? "No more results on this page." : "No providers match this intent."}
            </p>
            <p className="text-[11px] font-mono text-foreground/25">
              {page > 1 ? (
                <Link
                  href={buildPageHref(intent, 1)}
                  className="text-foreground/40 hover:text-foreground/60 underline underline-offset-2 transition-colors"
                >
                  Back to first page
                </Link>
              ) : (
                <>
                  Try a different search, or{" "}
                  <Link
                    href="/submit"
                    className="text-foreground/40 hover:text-foreground/60 underline underline-offset-2 transition-colors"
                  >
                    submit a provider
                  </Link>
                </>
              )}
            </p>
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-sm text-foreground/40">Enter an intent to search for providers.</p>
          </div>
        )}
      </div>
    </div>
  );
}
