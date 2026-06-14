import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Trophy, Image as ImageIcon } from "lucide-react";
import { ClawdTokenAction } from "@/components/ClawdTokenAction";

interface Holder {
  rank: number;
  owner: string;
  amount: number;
  pfp: string | null;
  pfpName: string | null;
  nftCount: number;
}

interface DirectoryResp {
  success: boolean;
  mint: string;
  totalHolders: number;
  holders: Holder[];
  generatedAt: string;
}

function shortAddr(a: string) {
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}
function fmtAmount(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toLocaleString();
}

export default function HoldersDirectoryPage() {
  const { data, isLoading, error } = useQuery<DirectoryResp>({
    queryKey: ["/api/holders/directory"],
    refetchInterval: 60_000,
  });

  return (
    <div className="container mx-auto py-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Trophy className="h-7 w-7 text-pink-500" />
          $CLAWD Holders Directory
        </h1>
        <p className="text-muted-foreground mt-1">
          Top holders enriched with their on-chain NFTs via Metaplex DAS.
          {data ? (
            <>
              {" "}
              <Badge variant="secondary" className="ml-1">
                {data.totalHolders.toLocaleString()} total holders
              </Badge>
              <ClawdTokenAction
                mintAddress={data.mint}
                symbol="CLAWD"
                name="CLAWD"
                variant="badge"
                className="ml-2"
              />
            </>
          ) : null}
        </p>
      </div>

      {error ? (
        <Card>
          <CardContent className="py-8 text-center text-destructive">
            Failed to load holders directory.
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.holders.map((h) => (
            <Card
              key={h.owner}
              className="overflow-hidden hover:border-pink-500/50 transition"
            >
              <CardHeader className="pb-2 flex flex-row items-center gap-3">
                <div className="h-12 w-12 rounded-lg overflow-hidden bg-muted flex items-center justify-center shrink-0">
                  {h.pfp ? (
                    <img
                      src={h.pfp}
                      alt={h.pfpName || ""}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span
                      className={
                        h.rank <= 3
                          ? "text-yellow-500"
                          : "text-muted-foreground"
                      }
                    >
                      #{h.rank}
                    </span>
                    <a
                      href={`https://solscan.io/account/${h.owner}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-pink-500 inline-flex items-center gap-1 truncate"
                      data-testid={`holder-link-${h.rank}`}
                    >
                      {shortAddr(h.owner)}
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-2xl font-bold text-pink-500">
                  {fmtAmount(h.amount)}
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex justify-between">
                  <span>$CLAWD</span>
                  <span>{h.nftCount} NFTs</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {data && (
        <div className="text-xs text-muted-foreground text-center mt-6">
          Updated {new Date(data.generatedAt).toLocaleTimeString()} · refreshes every 60s
        </div>
      )}
    </div>
  );
}
