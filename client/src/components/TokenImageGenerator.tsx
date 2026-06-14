import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface TokenImageGeneratorProps {
  onImageGenerated?: (url: string) => void;
}

export function TokenImageGenerator({ onImageGenerated }: TokenImageGeneratorProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleGenerateImage = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/xai/image-gen", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `professional token logo design for cryptocurrency: ${prompt}`,
          n: 1,
          aspect_ratio: "1:1",
          resolution: "1k",
          save_to_feed: true,
          storage_options: {
            filename: `token-logo-${Date.now()}.png`,
            public_url: true,
          },
        }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) throw new Error(result?.error || `HTTP ${response.status}`);

      const image = result.images?.[0];
      const imageUrl = image?.public_url || image?.file_output?.public_url || image?.url || (image?.b64_json ? `data:image/png;base64,${image.b64_json}` : "");
      if (imageUrl) {
        if (onImageGenerated) {
          onImageGenerated(imageUrl);
        }
      } else {
        setError("Failed to generate image. Please try again.");
      }
    } catch (e: any) {
      console.error("Image generation error:", e);
      setError(e.message || "Failed to generate image");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="bg-black/40 border-purple-500/30">
      <CardHeader>
        <CardTitle className="text-xl font-bold bg-gradient-to-r from-purple-400 to-blue-500 bg-clip-text text-transparent">
          Token Image Generator
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Describe your token's theme or concept..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="flex-1 bg-black/40 border-purple-500/30 focus:border-purple-500"
            />
            <Button 
              onClick={handleGenerateImage} 
              disabled={loading || !prompt.trim()}
              className="bg-purple-500/20 border-purple-500/30 hover:bg-purple-500/30"
            >
              {loading ? "Generating..." : "Generate"}
            </Button>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
