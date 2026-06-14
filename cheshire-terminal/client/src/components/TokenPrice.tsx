import { useTokenData } from "@/lib/solanaTracker";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface TokenPriceProps {
  tokenAddress: string;
}

export function TokenPrice({ tokenAddress }: TokenPriceProps) {
  const { data: tokenData, isLoading, error } = useTokenData(tokenAddress);

  if (isLoading) {
    return <Skeleton className="h-8 w-32" />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to fetch token price
        </AlertDescription>
      </Alert>
    );
  }

  if (!tokenData || !tokenData.pools.length) {
    return (
      <Alert>
        <AlertDescription>
          No price data available
        </AlertDescription>
      </Alert>
    );
  }

  const currentPool = tokenData.pools[0];
  const priceInUsd = currentPool.price.usd;
  const priceInSol = currentPool.price.quote;

  return (
    <div className="flex flex-col gap-1">
      <div className="text-2xl font-bold">
        ${priceInUsd.toFixed(6)}
      </div>
      <div className="text-sm text-muted-foreground">
        {priceInSol.toFixed(6)} SOL
      </div>
    </div>
  );
}
