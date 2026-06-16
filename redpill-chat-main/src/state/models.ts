import { create } from "zustand";
import type { Model } from "@/types/model";

interface ModelsState {
  models: Model[];
  setModels: (models: Model[]) => void;
}

export const useModelsStore = create<ModelsState>((set) => ({
  models: [],
  setModels: (models) => set({ models }),
}));
