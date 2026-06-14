import { TrendingNews } from "@/components/TrendingNews";
import { RealtimeArtFeed } from "@/components/RealtimeArtFeed";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Newspaper, Sparkles, Briefcase, Cpu, FlaskConical, Globe } from "lucide-react";

export default function NewsFeedPage() {
  return (
    <div className="max-w-7xl mx-auto py-6 space-y-6">
      <div className="text-center">
        <div className="flex items-center justify-center gap-3 mb-2">
          <Newspaper className="h-7 w-7 text-orange-400" />
          <h1 className="text-3xl font-black bg-gradient-to-r from-orange-400 via-purple-400 to-cyan-400 text-transparent bg-clip-text">
            News & Realtime Feed
          </h1>
          <Sparkles className="h-7 w-7 text-purple-400" />
        </div>
        <p className="text-purple-300/60 text-sm">
          Top crypto + AI headlines via NewsAPI · Live xAI art & video stream from the bucket
        </p>
      </div>

      <RealtimeArtFeed variant="full" limit={40} />

      <Tabs defaultValue="trending" className="space-y-4">
        <TabsList className="bg-black/60 border border-purple-500/20 grid grid-cols-5 max-w-2xl mx-auto">
          <TabsTrigger value="trending" data-testid="tab-trending"><Sparkles className="w-3 h-3 mr-1" />Trending</TabsTrigger>
          <TabsTrigger value="business" data-testid="tab-business"><Briefcase className="w-3 h-3 mr-1" />Business</TabsTrigger>
          <TabsTrigger value="technology" data-testid="tab-technology"><Cpu className="w-3 h-3 mr-1" />Tech</TabsTrigger>
          <TabsTrigger value="science" data-testid="tab-science"><FlaskConical className="w-3 h-3 mr-1" />Science</TabsTrigger>
          <TabsTrigger value="general" data-testid="tab-general"><Globe className="w-3 h-3 mr-1" />World</TabsTrigger>
        </TabsList>
        <TabsContent value="trending"><TrendingNews variant="full" limit={18} endpoint="trending" /></TabsContent>
        <TabsContent value="business"><TrendingNews variant="full" limit={18} endpoint="headlines" category="business" /></TabsContent>
        <TabsContent value="technology"><TrendingNews variant="full" limit={18} endpoint="headlines" category="technology" /></TabsContent>
        <TabsContent value="science"><TrendingNews variant="full" limit={18} endpoint="headlines" category="science" /></TabsContent>
        <TabsContent value="general"><TrendingNews variant="full" limit={18} endpoint="headlines" category="general" /></TabsContent>
      </Tabs>
    </div>
  );
}
