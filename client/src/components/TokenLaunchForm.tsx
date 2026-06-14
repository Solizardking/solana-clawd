import { useState } from 'react';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Rocket, Plus, Trash2 } from "lucide-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { TokenImageGenerator } from './TokenImageGenerator';
import { TokenLaunchProgress } from './TokenLaunchProgress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UseMutationResult } from '@tanstack/react-query';

type LaunchStage = 'preparing' | 'uploading' | 'minting' | 'confirming' | 'complete' | 'error';

const formSchema = z.object({
  name: z.string().min(1, "Token name is required"),
  symbol: z.string()
    .min(1, "Token symbol is required")
    .max(10, "Symbol must be 10 characters or less")
    .transform(val => val.toUpperCase()),
  description: z.string().min(1, "Description is required"),
  initialBuyAmount: z.string()
    .refine(val => !isNaN(Number(val)) && Number(val) > 0, "Must be a positive number")
    .transform(val => Number(val).toString()),
  buyers: z.array(z.string().min(32, "Invalid wallet address")).optional(),
});

type FormData = z.infer<typeof formSchema>;

interface TokenLaunchFormProps {
  launchMutation: UseMutationResult<any, Error, any>;
}

export function TokenLaunchForm({ launchMutation }: TokenLaunchFormProps) {
  const { publicKey } = useWallet();
  const [file, setFile] = useState<File | null>(null);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [buyerAddresses, setBuyerAddresses] = useState<string[]>([]);
  const [launchStage, setLaunchStage] = useState<LaunchStage>('preparing');
  const [launchError, setLaunchError] = useState<string>();
  const [isLaunching, setIsLaunching] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      symbol: "",
      description: "",
      initialBuyAmount: "0.001",
      buyers: [],
    },
  });

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && (droppedFile.type.startsWith('image/'))) {
      setFile(droppedFile);
      setGeneratedImageUrl(null);
    }
  };

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setGeneratedImageUrl(null);
    }
  };

  const handleGeneratedImage = (url: string) => {
    setGeneratedImageUrl(url);
    setFile(null);
  };

  const addBuyerAddress = () => {
    setBuyerAddresses([...buyerAddresses, ""]);
  };

  const removeBuyerAddress = (index: number) => {
    setBuyerAddresses(buyerAddresses.filter((_, i) => i !== index));
  };

  const updateBuyerAddress = (index: number, value: string) => {
    const newAddresses = [...buyerAddresses];
    newAddresses[index] = value;
    setBuyerAddresses(newAddresses);
  };

  const onSubmit = async (data: FormData) => {
    if (!publicKey) {
      alert("Please connect your wallet first");
      return;
    }

    if (!file && !generatedImageUrl) {
      alert("Please provide an image for your token");
      return;
    }

    try {
      setIsLaunching(true);
      setLaunchStage('preparing');

      // First, upload the image if we have a file
      let imageUrl = generatedImageUrl;
      if (file) {
        setLaunchStage('uploading');
        const formData = new FormData();
        formData.append('file', file);

        const uploadResponse = await fetch('/api/tokens/upload', {
          method: 'POST',
          body: formData
        });

        if (!uploadResponse.ok) {
          throw new Error('Failed to upload image');
        }

        const { url } = await uploadResponse.json();
        imageUrl = url;
      }

      // Then, send the token data as JSON
      setLaunchStage('minting');
      const response = await fetch('/api/tokens/launch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          ...data,
          wallet: publicKey.toBase58(),
          imageUrl,
          buyers: buyerAddresses.filter(addr => addr.length >= 32)
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || 'Failed to launch token');
      }

      const result = await response.json();

      setLaunchStage('confirming');
      await new Promise(resolve => setTimeout(resolve, 2000));
      setLaunchStage('complete');

      setTimeout(() => {
        form.reset();
        setFile(null);
        setGeneratedImageUrl(null);
        setBuyerAddresses([]);
        setShowForm(false);
        setIsLaunching(false);
      }, 2000);

    } catch (error) {
      console.error("Launch error:", error);
      setLaunchStage('error');
      setLaunchError(error instanceof Error ? error.message : "Failed to launch token");
      setIsLaunching(false);
    }
  };

  if (!showForm) {
    return (
      <Card className="w-full max-w-lg mx-auto bg-black/40 border-purple-500/30">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center bg-gradient-to-r from-purple-400 to-blue-500 bg-clip-text text-transparent">
            Launch New Token
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button
            onClick={() => setShowForm(true)}
            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500"
          >
            <Rocket className="mr-2 h-5 w-5" />
            Start Token Launch
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isLaunching) {
    return (
      <TokenLaunchProgress
        stage={launchStage}
        error={launchError}
      />
    );
  }

  return (
    <Card className="w-full max-w-lg mx-auto bg-black/40 border-purple-500/30">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-center bg-gradient-to-r from-purple-400 to-blue-500 bg-clip-text text-transparent">
          Launch New Token
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Token Name</FormLabel>
                  <FormControl>
                    <Input placeholder="My Awesome Token" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="symbol"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ticker Symbol</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-gray-400">$</span>
                      <Input placeholder="AWESOME" className="pl-7" {...field} />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Describe your token..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="initialBuyAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Initial Buy Amount (SOL)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.001" min="0.001" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Additional Buyers Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <FormLabel>Additional Buyers (Optional)</FormLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addBuyerAddress}
                  className="text-purple-400 hover:text-purple-300"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Buyer
                </Button>
              </div>

              {buyerAddresses.map((address, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={address}
                    onChange={(e) => updateBuyerAddress(index, e.target.value)}
                    placeholder="Solana wallet address"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeBuyerAddress(index)}
                    className="text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Token Image Section */}
            <div className="space-y-4">
              <FormLabel>Token Image</FormLabel>
              <Tabs defaultValue="upload" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="upload">Upload Image</TabsTrigger>
                  <TabsTrigger value="generate">Generate with AI</TabsTrigger>
                </TabsList>
                <TabsContent value="upload">
                  <div
                    className="border-2 border-dashed border-purple-500/30 rounded-lg p-4 text-center cursor-pointer hover:border-purple-500/50 transition-colors"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={onDrop}
                    onClick={() => document.getElementById('file-upload')?.click()}
                  >
                    {file ? (
                      <div className="text-purple-300">
                        Selected: {file.name}
                      </div>
                    ) : (
                      <div className="text-purple-300/60">
                        Drag and drop an image here, or click to select
                      </div>
                    )}
                    <input
                      id="file-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={onFileSelect}
                    />
                  </div>
                </TabsContent>
                <TabsContent value="generate">
                  <TokenImageGenerator onImageGenerated={handleGeneratedImage} />
                  {generatedImageUrl && (
                    <div className="mt-4">
                      <img
                        src={generatedImageUrl}
                        alt="Generated token image"
                        className="w-full rounded-lg shadow-lg"
                      />
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>

            <div className="flex space-x-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowForm(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={launchMutation.isPending}
                className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500"
              >
                {launchMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Launching...
                  </>
                ) : (
                  <>
                    <Rocket className="mr-2 h-5 w-5" />
                    Create Token
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
