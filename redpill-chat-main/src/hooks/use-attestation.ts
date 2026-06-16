import { useAttestationStore } from "@/state/attestation";
import type { AttestationReport } from "@/types/attestation";

interface UseAttestationReturn {
  isVerifying: boolean;
  isVerified: boolean;
  attestationData: AttestationReport | null;
  verifyAttestation: (modelName: string) => Promise<void>;
  error: string | null;
}

export function useAttestation(): UseAttestationReturn {
  const isVerifying = useAttestationStore((state) => state.isVerifying);
  const isVerified = useAttestationStore((state) => state.isVerified);
  const attestationData = useAttestationStore((state) => state.attestationData);
  const error = useAttestationStore((state) => state.error);
  const verifyAttestation = useAttestationStore(
    (state) => state.verifyAttestation,
  );

  return {
    isVerifying,
    isVerified,
    attestationData,
    verifyAttestation,
    error,
  };
}
