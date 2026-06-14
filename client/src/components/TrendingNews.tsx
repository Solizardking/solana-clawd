import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Newspaper, ExternalLink, Clock, TrendingUp, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface Article {
  source: { id: string | null; name: string };
  author: string | null;
  title: string;
  description: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

interface Props {
  variant?: "full" | "compact";
  limit?: number;
  endpoint?: "trending" | "headlines";
  category?: string;
}

export function TrendingNews({
  variant = "full",
  limit = 12,
  endpoint = "trending",
  category,
}: Props) {
  const url =
    endpoint === "trending"
      ? "/api/news/trending"
      : `/api/news/headlines${category ? `?category=${category}` : ""}`;

  const { data, isLoading, refetch, isFetching } = useQuery<{
    status: string;
    articles: Article[];
  }>({
    queryKey: [url],
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60_000,
  });

  const articles = (data?.articles ?? []).filter((a) => a.title && a.url).slice(0, limit);

  if (variant === "compact") {
    return (
      <div className="border border-purple-500/20 bg-black/40 backdrop-blur-sm rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-bold text-purple-200">
            <TrendingUp className="h-4 w-4 text-orange-400" />
            <span>Trending Headlines</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-purple-400/70 hover:text-purple-200"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-refresh-news"
          >
            <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <div className="space-y-2">
          {isLoading
            ? Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full bg-purple-900/20" />
              ))
            : articles.map((a, i) => (
                <a
                  key={`${a.url}-${i}`}
                  href={a.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="block group"
                  data-testid={`link-news-${i}`}
                >
                  <div className="flex items-start gap-2 text-xs hover:bg-purple-900/20 rounded px-2 py-1.5 transition-colors">
                    <span className="text-orange-400/70 font-mono shrink-0">{String(i + 1).padStart(2, "0")}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-purple-100 group-hover:text-white line-clamp-2 leading-snug">
                        {a.title}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-purple-400/60 mt-0.5">
                        <span className="truncate">{a.source.name}</span>
                        <span>•</span>
                        <span className="shrink-0">{timeAgo(a.publishedAt)}</span>
                      </div>
                    </div>
                  </div>
                </a>
              ))}
          {!isLoading && articles.length === 0 && (
            <p className="text-xs text-purple-400/60 text-center py-4">
              No headlines right now. Check back shortly.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card className="border-purple-500/30 bg-black/40 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-purple-200">
          <Newspaper className="h-5 w-5 text-orange-400" />
          Trending News
          <Badge variant="outline" className="border-orange-500/40 text-orange-300 text-[10px] ml-2">
            {endpoint === "trending" ? "CRYPTO · AI" : (category || "TOP")}
          </Badge>
        </CardTitle>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-purple-400 hover:text-purple-200"
          data-testid="button-refresh-news-full"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-44 w-full bg-purple-900/20" />
            ))
          : articles.map((a, i) => (
              <a
                key={`${a.url}-${i}`}
                href={a.url}
                target="_blank"
                rel="noreferrer noopener"
                className="group rounded-lg border border-purple-500/20 bg-black/30 hover:border-purple-400/60 hover:bg-purple-950/30 transition-all overflow-hidden flex flex-col"
                data-testid={`card-news-${i}`}
              >
                {a.urlToImage ? (
                  <div className="aspect-[16/9] overflow-hidden bg-purple-950/30">
                    <img
                      src={a.urlToImage}
                      alt=""
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                    />
                  </div>
                ) : (
                  <div className="aspect-[16/9] bg-gradient-to-br from-purple-900/40 to-orange-900/30 flex items-center justify-center">
                    <Newspaper className="h-8 w-8 text-purple-400/40" />
                  </div>
                )}
                <div className="p-3 flex-1 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-[10px] text-purple-400/70">
                    <span className="font-semibold text-orange-300/80 truncate">
                      {a.source.name}
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      <Clock className="h-3 w-3" />
                      {timeAgo(a.publishedAt)}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-purple-100 line-clamp-2 group-hover:text-white">
                    {a.title}
                  </h3>
                  {a.description && (
                    <p className="text-xs text-purple-300/70 line-clamp-2 mt-auto">
                      {a.description}
                    </p>
                  )}
                  <span className="flex items-center gap-1 text-[10px] text-purple-400/60 group-hover:text-orange-300 mt-1">
                    Read article <ExternalLink className="h-3 w-3" />
                  </span>
                </div>
              </a>
            ))}
        {!isLoading && articles.length === 0 && (
          <p className="col-span-full text-sm text-purple-400/60 text-center py-8">
            No headlines available right now.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default TrendingNews;
