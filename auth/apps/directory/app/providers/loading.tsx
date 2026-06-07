import { Nav } from "@/components/nav";
import { SearchBar } from "@/components/search-bar";

function CardSkeleton() {
  return (
    <div className="border border-foreground/[0.06] bg-foreground/[0.02] p-4 space-y-3 animate-pulse">
      <div className="h-3.5 w-1/2 bg-foreground/[0.06]" />
      <div className="h-3 w-full bg-foreground/[0.04]" />
      <div className="h-3 w-3/4 bg-foreground/[0.04]" />
      <div className="flex gap-1.5 pt-1">
        <div className="h-4 w-12 bg-foreground/[0.05]" />
        <div className="h-4 w-16 bg-foreground/[0.05]" />
      </div>
    </div>
  );
}

export default function ProvidersLoading() {
  return (
    <div className="min-h-dvh flex flex-col">
      <Nav />

      <div className="border-b border-foreground/[0.06] px-4 sm:px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <SearchBar />
        </div>
      </div>

      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="h-3 w-32 bg-foreground/[0.06] animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
