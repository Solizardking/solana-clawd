import { useApiHealth, useTokenData } from "@/lib/solanaTracker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function APIStatus() {
  const { data: health, error: healthError, isLoading: healthLoading } = useApiHealth();

  // Use a known token (SOL) to test data fetching
  const { data: tokenData, error: tokenError, isLoading: tokenLoading } = useTokenData(
    "So11111111111111111111111111111111111111112"
  );

  if (healthLoading || tokenLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>API Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse">
            Loading API status...
          </div>
        </CardContent>
      </Card>
    );
  }

  // Only show error if both health check and token data fail
  if (healthError && tokenError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          API connection issue. Please try again later.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          API Status
          <Badge variant={health || tokenData ? "default" : "destructive"} className={health || tokenData ? "bg-green-500" : undefined}>
            {health || tokenData ? "Connected" : "Disconnected"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {tokenData && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Last Updated: {new Date(health?.timestamp || 0).toLocaleString()}
            </p>
            <div className="flex items-center gap-2">
              <span className="font-medium">SOL Price:</span>
              <span>${tokenData.pools[0]?.price.usd.toFixed(2)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}