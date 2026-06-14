import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface MemeTemplate {
  id: string;
  name: string;
  url: string;
}

export function MemeGenerator() {
  const { toast } = useToast();
  const [topText, setTopText] = useState('');
  const [bottomText, setBottomText] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<MemeTemplate | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const { data: templates = [], isLoading } = useQuery<MemeTemplate[]>({
    queryKey: ['memeTemplates'],
    queryFn: async () => {
      return apiRequest<MemeTemplate[]>('/api/memes/templates');
    }
  });

  const handleGenerate = async () => {
    if (!selectedTemplate) {
      toast({
        title: "Select a template",
        description: "Please select a meme template first",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsGenerating(true);
      const response = await apiRequest('/api/memes/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          templateId: selectedTemplate.id,
          topText,
          bottomText
        })
      });

      // Handle successful meme generation
      toast({
        title: "Meme Generated!",
        description: "Your meme has been created successfully",
      });

    } catch (error) {
      toast({
        title: "Generation Failed",
        description: "Failed to generate meme. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card className="bg-black/40 border-purple-500/30">
      <CardHeader>
        <CardTitle className="text-purple-200">Create a Meme</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {templates?.map((template) => (
              <div
                key={template.id}
                className={`cursor-pointer rounded-lg overflow-hidden border-2 transition-colors ${
                  selectedTemplate?.id === template.id
                    ? 'border-purple-500'
                    : 'border-transparent hover:border-purple-500/50'
                }`}
                onClick={() => setSelectedTemplate(template)}
              >
                <img
                  src={template.url}
                  alt={template.name}
                  className="w-full h-32 object-cover"
                />
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Input
              placeholder="Top text"
              value={topText}
              onChange={(e) => setTopText(e.target.value)}
              className="bg-black/40 border-purple-500/30"
            />
            <Input
              placeholder="Bottom text"
              value={bottomText}
              onChange={(e) => setBottomText(e.target.value)}
              className="bg-black/40 border-purple-500/30"
            />
          </div>

          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !selectedTemplate}
            className="w-full bg-purple-500/20 border-purple-500/30 hover:bg-purple-500/30"
          >
            {isGenerating ? (
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
        </div>
      </CardContent>
    </Card>
  );
}
