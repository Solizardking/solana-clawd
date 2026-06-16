import { create } from "zustand";
import { env } from "@/env";
import type { AttestationReport } from "@/types/attestation";

interface AttestationState {
  isVerifying: boolean;
  isVerified: boolean;
  attestationData: AttestationReport | null;
  error: string | null;
  currentModel: string | null;

  // Actions
  setIsVerifying: (isVerifying: boolean) => void;
  setIsVerified: (isVerified: boolean) => void;
  setAttestationData: (data: AttestationReport | null) => void;
  setError: (error: string | null) => void;
  setCurrentModel: (model: string | null) => void;

  // Async action
  verifyAttestation: (modelName: string) => Promise<void>;
}

export const useAttestationStore = create<AttestationState>()((set, get) => ({
  isVerifying: false,
  isVerified: false,
  attestationData: null,
  error: null,
  currentModel: null,

  setIsVerifying: (isVerifying) => set({ isVerifying }),
  setIsVerified: (isVerified) => set({ isVerified }),
  setAttestationData: (attestationData) => set({ attestationData }),
  setError: (error) => set({ error }),
  setCurrentModel: (currentModel) => set({ currentModel }),

  verifyAttestation: async (modelName: string) => {
    const state = get();

    // Don't re-verify if already verifying the same model
    if (state.isVerifying && state.currentModel === modelName) {
      return;
    }

    set({
      isVerifying: true,
      isVerified: false,
      error: null,
      currentModel: modelName,
    });

    try {
      const response = await fetch(
        `${env.NEXT_PUBLIC_REDPILL_API_URL}/v1/attestation/report?model=${encodeURIComponent(modelName)}`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error(
          `Failed to verify attestation: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();

      // Check if response contains model_attestations key
      const attestationData =
        "model_attestations" in data ? data.model_attestations[0] : data;

      set({
        attestationData: attestationData as AttestationReport,
        isVerified: true,
        isVerifying: false,
        error: null,
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to verify attestation";
      console.error("Verification failed:", err);
      set({
        error: errorMessage,
        attestationData: null,
        isVerified: false,
        isVerifying: false,
      });
    }
  },
}));
