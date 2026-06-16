import { ChatInterface } from "@/components/chat-interface";
import { env } from "@/env";
import type { Model } from "@/types/model";

async function getModels(): Promise<Model[]> {
  try {
    const apiUrl = env.API_URL;
    if (!apiUrl) {
      console.warn("API_URL environment variable is not set");
      return [];
    }

    const response = await fetch(`${apiUrl}/api/models`, {
      next: { revalidate: 7200 },
    });

    if (!response.ok) {
      throw new Error("Failed to fetch models");
    }

    const data = await response.json();
    const models = data.data || [];

    // Filter out models with output_modalities that is 'embeddings'
    const filteredModels = models.filter((model: Model) => {
      return !model.specs?.output_modalities?.includes("embeddings");
    });

    // Sort to put qwen/qwen2.5-vl-72b-instruct at the beginning
    return filteredModels.sort((a: Model, b: Model) => {
      if (a.id === "qwen/qwen-2.5-7b-instruct") return -1;
      if (b.id === "qwen/qwen-2.5-7b-instruct") return 1;
      return 0;
    });
  } catch (error) {
    console.error("Error fetching models:", error);
    return [];
  }
}

interface PageProps {
  searchParams: Promise<{ model?: string }>;
}

export default async function Home({ searchParams }: PageProps) {
  const models = await getModels();
  const { model: initialModel } = await searchParams;

  return <ChatInterface models={models} initialModel={initialModel} />;
}
