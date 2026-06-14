import Container from "@/components/ui/container";
import DeepSeekProver from "@/components/DeepSeekProver";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

export function ProverPage() {
  const { toast } = useToast();
  const [isApiKeyMissing, setIsApiKeyMissing] = useState(false);
  const [isCheckingApi, setIsCheckingApi] = useState(true);

  useEffect(() => {
    const checkApiStatus = async () => {
      setIsCheckingApi(true);
      try {
        const response = await fetch("/api/openrouter/status");
        const data = await response.json();

        if (response.ok && data.status === "success") {
          setIsApiKeyMissing(false);
        } else {
          setIsApiKeyMissing(true);
          toast({
            title: "API Configuration Issue",
            description:
              data.message || "DeepSeek API is not properly configured. Please check DEEPSEEK_API_KEY.",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error("Error checking API status:", error);
        setIsApiKeyMissing(true);
        toast({
          title: "API Connection Error",
          description: "Failed to check DeepSeek API status. The API may be unavailable.",
          variant: "destructive",
        });
      } finally {
        setIsCheckingApi(false);
      }
    };

    checkApiStatus();
  }, [toast]);

  return (
    <Container className="py-10">
      <div className="space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold">Deep CLAWD Studio</h1>
          <p className="text-muted-foreground">
            Agentic reasoning, formal proofs, and on-chain token analysis — powered by DeepSeek V4 Pro thinking mode.
          </p>
        </div>

        {isCheckingApi ? (
          <div className="border border-gray-200 bg-gray-50 dark:bg-gray-800/20 dark:border-gray-700 rounded-lg p-6 text-center flex flex-col items-center justify-center min-h-[200px]">
            <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary" />
            <p className="text-lg">Checking DeepSeek API status...</p>
          </div>
        ) : isApiKeyMissing ? (
          <div className="border border-red-300 bg-red-50 dark:bg-red-950/20 rounded-lg p-6 text-center">
            <h3 className="text-xl font-semibold text-red-700 dark:text-red-400 mb-2">
              DEEPSEEK_API_KEY required
            </h3>
            <p className="mb-4">
              Add your DeepSeek API key to the environment to unlock Deep CLAWD Studio.
            </p>
            <p className="text-sm opacity-80">
              Get a key at{" "}
              <a
                href="https://platform.deepseek.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline"
              >
                platform.deepseek.com
              </a>
            </p>
          </div>
        ) : (
          <DeepSeekProver />
        )}

        <div className="text-center space-y-2 max-w-2xl mx-auto">
          <h2 className="text-2xl font-semibold">About Deep CLAWD Studio</h2>
          <p className="text-muted-foreground">
            Deep CLAWD is a Cheshire-themed agentic frontend for DeepSeek V4 Pro and Flash. It exposes
            thinking-mode reasoning, JSON output, and tool calls so you can run formal proofs, audit Solana
            tokens, and prototype agent personas before deploying them to the Cheshire Terminal.
          </p>
        </div>
      </div>
    </Container>
  );
}

export default ProverPage;
