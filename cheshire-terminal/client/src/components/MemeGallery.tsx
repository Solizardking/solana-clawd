import { useState, useEffect } from 'react';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertCircle, Image as ImageIcon, Loader2, Share2, ThumbsUp, UserPlus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { grokAI } from '@/lib/grokAI';
import { useToast } from '@/hooks/use-toast';

interface GeneratedMeme {
  id: string;
  prompt: string;
  imageUrl: string;
  creator: string;
  createdAt: string;
  likes: number;
  description?: string;
}

// In-memory storage for generated memes since we don't have a database yet
const savedMemes: GeneratedMeme[] = [];

export default function MemeGallery() {
  const [activeTab, setActiveTab] = useState('generate');
  const [memePrompt, setMemePrompt] = useState('');
  const [generatingMeme, setGeneratingMeme] = useState(false);
  const [generatedMeme, setGeneratedMeme] = useState<{ url?: string; prompt?: string }>({});
  const [savedUserMemes, setSavedUserMemes] = useState<GeneratedMeme[]>([]);
  const [trendingMemes, setTrendingMemes] = useState<GeneratedMeme[]>([]);
  const [grokImageError, setGrokImageError] = useState<string | null>(null);
  const { toast } = useToast();

  // Fetch memes on component mount
  useEffect(() => {
    // For now we'll just use mock data until we have a database
    setSavedUserMemes(savedMemes);
    
    // Generate some trending memes based on current meme trends
    setTrendingMemes([
      {
        id: 'trending-1',
        prompt: 'Solana rocket taking off with a "to the moon" meme',
        imageUrl: 'https://picsum.photos/seed/solana1/400/300',
        creator: 'MemeCreator92',
        createdAt: '2 hours ago',
        likes: 243
      },
      {
        id: 'trending-2',
        prompt: 'Cheshire cat watching tokens crash with a smile',
        imageUrl: 'https://picsum.photos/seed/cheshire/400/300',
        creator: 'TokenWizard',
        createdAt: '5 hours ago',
        likes: 189
      },
      {
        id: 'trending-3',
        prompt: 'Base blockchain vs Solana speed comparison meme',
        imageUrl: 'https://picsum.photos/seed/basechain/400/300',
        creator: 'ChainMaster',
        createdAt: '1 day ago',
        likes: 432
      }
    ]);
  }, []);

  // Generate meme with Grok
  const generateMeme = async () => {
    if (!memePrompt.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a prompt for your meme.',
        variant: 'destructive'
      });
      return;
    }

    setGeneratingMeme(true);
    setGrokImageError(null);
    
    try {
      const improved = await grokAI.analyzeMemeIdea(memePrompt);
      const images = await grokAI.generateImage({
        prompt: improved.improvedPrompt,
      });

      if (images.length > 0 && images[0].url) {
        setGeneratedMeme({
          url: images[0].url,
          prompt: improved.improvedPrompt,
        });
      } else {
        throw new Error('Failed to generate image');
      }
      
      // Auto-switch to the preview tab
      setActiveTab('preview');
      
    } catch (error) {
      console.error('Error generating meme:', error);
      setGrokImageError(error instanceof Error ? error.message : 'Failed to generate meme image');
      toast({
        title: 'Generation Failed',
        description: 'There was an error generating your meme. Please try again with a different prompt.',
        variant: 'destructive'
      });
    } finally {
      setGeneratingMeme(false);
    }
  };

  // Save the generated meme
  const saveMeme = () => {
    if (generatedMeme.url) {
      const newMeme: GeneratedMeme = {
        id: `meme-${Date.now()}`,
        prompt: generatedMeme.prompt || memePrompt,
        imageUrl: generatedMeme.url,
        creator: 'You',
        createdAt: 'Just now',
        likes: 0,
        description: memePrompt
      };
      
      // Add to our in-memory store
      savedMemes.push(newMeme);
      setSavedUserMemes([...savedMemes]);
      
      // Clear the generated meme and prompt
      setGeneratedMeme({});
      setMemePrompt('');
      
      // Switch to the gallery tab
      setActiveTab('gallery');
      
      toast({
        title: 'Meme Saved!',
        description: 'Your meme has been added to your gallery.'
      });
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6 bg-gradient-to-r from-pink-500 to-purple-600 text-transparent bg-clip-text">
        Meme Generator & Gallery
      </h1>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-3 mb-8">
          <TabsTrigger value="generate">Create</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="gallery">Gallery</TabsTrigger>
        </TabsList>
        
        {/* Create Tab */}
        <TabsContent value="generate" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Create a Meme with Grok AI</CardTitle>
              <CardDescription>
                Enter a detailed description of the meme you want to create. 
                Grok will optimize your prompt and generate an image.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="meme-prompt">Meme Description</Label>
                <Textarea
                  id="meme-prompt"
                  placeholder="Describe the meme you want to create... (e.g., 'A Shiba Inu dog in a spacesuit on the moon with a Solana flag')"
                  value={memePrompt}
                  onChange={(e) => setMemePrompt(e.target.value)}
                  rows={6}
                  className="resize-none"
                />
              </div>
              
              {grokImageError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{grokImageError}</AlertDescription>
                </Alert>
              )}
            </CardContent>
            <CardFooter>
              <Button 
                onClick={generateMeme} 
                disabled={generatingMeme || !memePrompt.trim()} 
                className="w-full"
              >
                {generatingMeme ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <ImageIcon className="mr-2 h-4 w-4" />
                    Generate Meme
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Tips for Great Memes</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc pl-5 space-y-2">
                <li>Be specific about the style (photo-realistic, cartoon, pixelated, etc.)</li>
                <li>Include details about the setting and background</li>
                <li>Describe facial expressions and emotions</li>
                <li>For text overlays, specify placement and style</li>
                <li>Keep cultural references clear and direct</li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Preview Tab */}
        <TabsContent value="preview">
          <Card>
            <CardHeader>
              <CardTitle>Meme Preview</CardTitle>
              <CardDescription>
                Here's your generated meme. You can save it to your gallery or create a new one.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              {generatedMeme.url ? (
                <div className="space-y-4 w-full">
                  <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800">
                    <img 
                      src={generatedMeme.url} 
                      alt="Generated meme" 
                      className="w-full object-contain max-h-[500px]"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Prompt Used</Label>
                    <p className="text-sm p-3 bg-secondary rounded-md">{generatedMeme.prompt || memePrompt}</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-4 w-full">
                  <div className="rounded-lg bg-muted p-8 w-full">
                    <ImageIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">
                      {generatingMeme 
                        ? "Your meme is being generated..." 
                        : "No meme generated yet. Go to the Create tab to make one!"}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button 
                variant="outline"
                onClick={() => setActiveTab('generate')}
              >
                Back to Create
              </Button>
              <Button 
                onClick={saveMeme}
                disabled={!generatedMeme.url}
              >
                Save to Gallery
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        {/* Gallery Tab */}
        <TabsContent value="gallery">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* User's Memes */}
            <Card className="col-span-full mb-8">
              <CardHeader className="pb-4">
                <CardTitle>Your Memes</CardTitle>
                <CardDescription>Memes you've created with Grok AI</CardDescription>
              </CardHeader>
              <CardContent>
                {savedUserMemes.length === 0 ? (
                  <div className="text-center p-8">
                    <ImageIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">You haven't created any memes yet</p>
                    <Button 
                      variant="outline" 
                      className="mt-4"
                      onClick={() => setActiveTab('generate')}
                    >
                      Create Your First Meme
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {savedUserMemes.map(meme => (
                      <div key={meme.id} className="border rounded-lg overflow-hidden">
                        <img 
                          src={meme.imageUrl} 
                          alt={meme.prompt} 
                          className="w-full h-48 object-cover"
                        />
                        <div className="p-3">
                          <p className="text-sm font-medium truncate">{meme.prompt}</p>
                          <div className="flex justify-between items-center mt-2">
                            <span className="text-xs text-muted-foreground">{meme.createdAt}</span>
                            <Button variant="ghost" size="icon">
                              <Share2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* Trending Memes */}
            <Card className="col-span-full">
              <CardHeader className="pb-4">
                <CardTitle>Trending Memes</CardTitle>
                <CardDescription>Popular memes in the community</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {trendingMemes.map(meme => (
                    <div key={meme.id} className="border rounded-lg overflow-hidden">
                      <img 
                        src={meme.imageUrl} 
                        alt={meme.prompt} 
                        className="w-full h-48 object-cover"
                      />
                      <div className="p-3">
                        <p className="text-sm font-medium truncate">{meme.prompt}</p>
                        <div className="flex justify-between items-center mt-2">
                          <div className="flex items-center space-x-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <ThumbsUp className="h-4 w-4" />
                            </Button>
                            <span className="text-xs">{meme.likes}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">{meme.creator}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
