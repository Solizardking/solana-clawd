import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { ChatCompletionResponse, VisionAnalysisResponse, JsonGenerationResponse } from "../types/api";

const GrokTestPage: React.FC = () => {
  // Chat completion states
  const [prompt, setPrompt] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [chatResponse, setChatResponse] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Vision states
  const [imageUrl, setImageUrl] = useState("");
  const [imagePrompt, setImagePrompt] = useState("Analyze this image and provide a detailed description.");
  const [visionResponse, setVisionResponse] = useState("");
  const [isVisionLoading, setIsVisionLoading] = useState(false);

  // JSON states
  const [jsonPrompt, setJsonPrompt] = useState("");
  const [jsonSystemPrompt, setJsonSystemPrompt] = useState("You are a helpful assistant that returns well-structured JSON.");
  const [jsonResponse, setJsonResponse] = useState("");
  const [isJsonLoading, setIsJsonLoading] = useState(false);

  // Handle chat completion
  const handleChatSubmit = async () => {
    if (!prompt) {
      toast({
        title: "Missing input",
        description: "Please enter a prompt to generate a response.",
        variant: "destructive"
      });
      return;
    }

    setIsChatLoading(true);
    setChatResponse("");

    try {
      const messages = [];
      
      if (systemPrompt) {
        messages.push({
          role: "system",
          content: systemPrompt
        });
      }
      
      messages.push({
        role: "user",
        content: prompt
      });

      const result = await apiRequest<ChatCompletionResponse>('/api/xai/chat', {
        method: 'POST',
        body: JSON.stringify({
          model: "grok-3",
          messages,
          temperature: 0.7
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (result && result.success) {
        setChatResponse(result.response);
      } else {
        throw new Error((result && result.error) || "Failed to generate response");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to generate response",
        variant: "destructive"
      });
    } finally {
      setIsChatLoading(false);
    }
  };

  // Handle vision API
  const handleVisionSubmit = async () => {
    if (!imageUrl) {
      toast({
        title: "Missing input",
        description: "Please enter an image URL to analyze.",
        variant: "destructive"
      });
      return;
    }

    setIsVisionLoading(true);
    setVisionResponse("");

    try {
      const result = await apiRequest<VisionAnalysisResponse>('/api/xai/vision', {
        method: 'POST',
        body: JSON.stringify({
          image_url: imageUrl,
          prompt: imagePrompt
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (result && result.success) {
        setVisionResponse(result.analysis);
      } else {
        throw new Error((result && result.error) || "Failed to analyze image");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to analyze image",
        variant: "destructive"
      });
    } finally {
      setIsVisionLoading(false);
    }
  };

  // Handle JSON generation
  const handleJsonSubmit = async () => {
    if (!jsonPrompt) {
      toast({
        title: "Missing input",
        description: "Please enter a prompt to generate JSON.",
        variant: "destructive"
      });
      return;
    }

    setIsJsonLoading(true);
    setJsonResponse("");

    try {
      const result = await apiRequest<JsonGenerationResponse>('/api/xai/json', {
        method: 'POST',
        body: JSON.stringify({
          prompt: jsonPrompt,
          system_prompt: jsonSystemPrompt
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (result && result.success) {
        setJsonResponse(JSON.stringify(result.data, null, 2));
      } else {
        throw new Error((result && result.error) || "Failed to generate JSON");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to generate JSON",
        variant: "destructive"
      });
    } finally {
      setIsJsonLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-4xl font-bold mb-6">Grok AI Test Console</h1>
      <p className="text-lg mb-8">
        Test the XAI (Grok) API integration with different capabilities
      </p>

      <Tabs defaultValue="chat" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="chat">Chat Completion</TabsTrigger>
          <TabsTrigger value="vision">Vision</TabsTrigger>
          <TabsTrigger value="json">JSON Generation</TabsTrigger>
        </TabsList>

        {/* Chat Completion Tab */}
        <TabsContent value="chat">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Chat Prompt</CardTitle>
                <CardDescription>
                  Enter your prompt and optional system instructions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="systemPrompt">System Prompt (Optional)</Label>
                    <Textarea
                      id="systemPrompt"
                      placeholder="You are a helpful assistant that..."
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prompt">User Prompt</Label>
                    <Textarea
                      id="prompt"
                      placeholder="Enter your prompt here..."
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      rows={6}
                      required
                    />
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button 
                  onClick={handleChatSubmit} 
                  disabled={isChatLoading}
                  className="w-full"
                >
                  {isChatLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    "Generate Response"
                  )}
                </Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Response</CardTitle>
                <CardDescription>
                  Generated completion from Grok
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="min-h-[300px] max-h-[500px] overflow-y-auto p-4 border rounded-md bg-muted">
                  {isChatLoading ? (
                    <div className="flex justify-center items-center h-full">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : chatResponse ? (
                    <div className="whitespace-pre-wrap">{chatResponse}</div>
                  ) : (
                    <div className="text-muted-foreground">Response will appear here</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Vision Tab */}
        <TabsContent value="vision">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Image Analysis</CardTitle>
                <CardDescription>
                  Analyze an image using Grok's vision capabilities
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="imageUrl">Image URL</Label>
                    <Input
                      id="imageUrl"
                      type="text"
                      placeholder="https://example.com/image.jpg"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                    />
                  </div>
                  
                  {imageUrl && (
                    <div className="border rounded-md p-2 bg-muted">
                      <img 
                        src={imageUrl} 
                        alt="Preview" 
                        className="max-h-[200px] mx-auto object-contain" 
                        onError={(e) => {
                          e.currentTarget.src = ""; 
                          e.currentTarget.alt = "Invalid image URL";
                        }} 
                      />
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    <Label htmlFor="imagePrompt">Analysis Prompt</Label>
                    <Textarea
                      id="imagePrompt"
                      placeholder="Analyze this image and describe what you see..."
                      value={imagePrompt}
                      onChange={(e) => setImagePrompt(e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button 
                  onClick={handleVisionSubmit} 
                  disabled={isVisionLoading}
                  className="w-full"
                >
                  {isVisionLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    "Analyze Image"
                  )}
                </Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Analysis Result</CardTitle>
                <CardDescription>
                  Vision analysis from Grok
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="min-h-[300px] max-h-[500px] overflow-y-auto p-4 border rounded-md bg-muted">
                  {isVisionLoading ? (
                    <div className="flex justify-center items-center h-full">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : visionResponse ? (
                    <div className="whitespace-pre-wrap">{visionResponse}</div>
                  ) : (
                    <div className="text-muted-foreground">Analysis will appear here</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* JSON Generation Tab */}
        <TabsContent value="json">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>JSON Generation</CardTitle>
                <CardDescription>
                  Generate structured JSON data using Grok
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="jsonSystemPrompt">System Prompt</Label>
                    <Textarea
                      id="jsonSystemPrompt"
                      placeholder="You are a helpful assistant that returns well-structured JSON."
                      value={jsonSystemPrompt}
                      onChange={(e) => setJsonSystemPrompt(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="jsonPrompt">JSON Prompt</Label>
                    <Textarea
                      id="jsonPrompt"
                      placeholder="Generate a JSON object that represents..."
                      value={jsonPrompt}
                      onChange={(e) => setJsonPrompt(e.target.value)}
                      rows={6}
                      required
                    />
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button 
                  onClick={handleJsonSubmit} 
                  disabled={isJsonLoading}
                  className="w-full"
                >
                  {isJsonLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    "Generate JSON"
                  )}
                </Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Generated JSON</CardTitle>
                <CardDescription>
                  Structured JSON data from Grok
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="min-h-[300px] max-h-[500px] overflow-y-auto p-4 border rounded-md bg-muted font-mono text-sm">
                  {isJsonLoading ? (
                    <div className="flex justify-center items-center h-full">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : jsonResponse ? (
                    <pre>{jsonResponse}</pre>
                  ) : (
                    <div className="text-muted-foreground">JSON will appear here</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default GrokTestPage;