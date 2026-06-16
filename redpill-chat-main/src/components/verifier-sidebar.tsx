"use client";

import {
  AlertCircle,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  RefreshCw,
  X,
} from "lucide-react";
import Image from "next/image";
import type { FC, ReactNode } from "react";
import { useEffect, useState } from "react";
import { TinfoilVerifierSidebar } from "@/components/tinfoil-verifier-sidebar";
import { Button } from "@/components/ui/button";
import { RIGHT_PANEL_WIDTH } from "@/constants";
import { useAttestation } from "@/hooks/use-attestation";
import { useChatSettings } from "@/hooks/use-chat-settings";
import { cn } from "@/lib/utils";
import { useModelsStore } from "@/state/models";
import type { NvidiaPayload } from "@/types/attestation";

interface VerifierSidebarProps {
  isVisible: boolean;
  onClose: () => void;
}

interface AttestationCardProps {
  title: string;
  verified: boolean;
  loading: boolean;
  description: ReactNode;
  details: Record<string, string>;
  isExpanded: boolean;
  onToggle: () => void;
}

const AttestationCard: FC<AttestationCardProps> = ({
  title,
  verified,
  loading,
  description,
  details,
  isExpanded,
  onToggle,
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = async (text: string, fieldId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldId);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  };

  return (
    <div className="bg-background rounded-lg overflow-hidden border">
      <Button
        variant="ghost"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 sm:p-4 hover:bg-muted/50 transition-colors min-h-[56px] h-auto"
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0",
              loading
                ? "bg-muted-foreground"
                : verified
                  ? "bg-green-500"
                  : "bg-muted-foreground",
            )}
          >
            {loading ? (
              <RefreshCw className="h-3 w-3 text-background animate-spin" />
            ) : (
              <Check className="h-3 w-3 text-background" />
            )}
          </div>
          <span className="text-foreground font-medium text-sm sm:text-base">
            {title}
          </span>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-200 flex-shrink-0",
            isExpanded ? "rotate-180" : "",
          )}
        />
      </Button>
      {isExpanded && (
        <div className="px-3 sm:px-4 pb-3 sm:pb-4 border-t bg-background">
          {description && (
            <div className="border-b border-border py-3 sm:py-4">
              {description}
            </div>
          )}
          <div className="mt-3 space-y-3">
            {Object.entries(details).map(([key, value]) => {
              const fieldId = `${title}-${key}`;
              return (
                <div key={fieldId} className="flex flex-col gap-2">
                  <span className="text-muted-foreground font-medium text-xs sm:text-sm">
                    {key}
                  </span>
                  <div className="relative">
                    <pre className="text-foreground font-mono text-xs break-all bg-muted p-3 rounded overflow-y-auto max-h-[100px] sm:max-h-[120px] whitespace-pre-wrap">
                      {value}
                    </pre>
                    {value.length > 100 && (
                      <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-muted to-transparent z-10" />
                    )}
                    <div className="absolute bottom-2 right-2 flex items-center gap-1 z-20">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopy(value, fieldId);
                        }}
                        className="h-6 px-2 text-xs bg-background/80 hover:bg-background"
                      >
                        <Copy className="h-2.5 w-2.5 mr-1" />
                        {copiedField === fieldId ? "Copied!" : "Copy"}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export const VerifierSidebar: FC<VerifierSidebarProps> = ({
  isVisible,
  onClose,
}) => {
  const { model: selectedModel } = useChatSettings();
  const models = useModelsStore((state) => state.models);
  const { isVerifying, isVerified, attestationData, verifyAttestation, error } =
    useAttestation();
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

  // Get current model info to check if it's tinfoil
  const currentModel = models.find((m) => m.id === selectedModel);
  const isTinfoilModel = currentModel
    ? currentModel.providers.includes("tinfoil")
    : false;

  // Note: Auto-verification is now handled in ComposerControls
  // Only trigger verification here if we don't have any data yet
  useEffect(() => {
    if (
      selectedModel &&
      isVisible &&
      !isVerifying &&
      !isVerified &&
      !error &&
      !isTinfoilModel
    ) {
      verifyAttestation(selectedModel);
    }
  }, [
    selectedModel,
    isVisible,
    isVerifying,
    isVerified,
    error,
    verifyAttestation,
    isTinfoilModel,
  ]);

  // If the model is from Tinfoil provider, render the Tinfoil verifier sidebar
  if (isTinfoilModel) {
    return <TinfoilVerifierSidebar isVisible={isVisible} onClose={onClose} />;
  }

  const parseNvidiaPayload = (payload: string): NvidiaPayload | null => {
    try {
      const parsed = JSON.parse(payload);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "nonce" in parsed &&
        "evidence_list" in parsed &&
        "arch" in parsed
      ) {
        return parsed as NvidiaPayload;
      }
      return null;
    } catch (err) {
      console.error("Failed to parse nvidia payload:", err);
      return null;
    }
  };

  const toggleItem = (index: number) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedItems(newExpanded);
  };

  return (
    <aside
      className={cn(
        "fixed inset-y-0 right-0 z-30 flex w-[90vw] max-w-[345px] flex-col border-l border-border bg-muted px-3 py-3 text-sm transition-transform duration-250 ease-in-out sm:px-4 sm:py-4",
        isVisible
          ? "pointer-events-auto translate-x-0 opacity-100"
          : "pointer-events-none translate-x-full opacity-0",
      )}
      aria-hidden={!isVisible}
      style={{ maxWidth: RIGHT_PANEL_WIDTH }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 text-foreground">
        <h2 className="text-base font-semibold">Verification Center</h2>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Close verification center"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto space-y-4 mt-4">
        {/* Confidentiality Status */}
        <div
          className={cn(
            "flex items-center gap-3 p-4 rounded-lg border",
            isVerifying
              ? "bg-muted border-border"
              : isVerified
                ? "bg-green-50 border-green-200"
                : "bg-red-50 border-red-200",
          )}
        >
          {isVerifying ? (
            <RefreshCw className="h-5 w-5 text-muted-foreground animate-spin flex-shrink-0" />
          ) : isVerified ? (
            <Check className="h-5 w-5 text-green-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
          )}
          <span
            className={cn(
              "font-medium text-sm",
              isVerifying
                ? "text-foreground"
                : isVerified
                  ? "text-green-800"
                  : "text-red-800",
            )}
          >
            {isVerifying
              ? "Verifying confidentiality..."
              : isVerified
                ? "Your chat is confidential."
                : "Verification unsuccessful."}
          </span>
        </div>

        {/* Main Info Section */}
        <div className="bg-background p-4 rounded-lg border space-y-4">
          {/* Attestation Info */}
          <div className="flex items-center justify-center gap-2 text-foreground">
            <span className="text-sm">Attested by</span>
            <Image
              src="/logos/nvidia.svg"
              alt="NVIDIA"
              width={60}
              height={16}
              className="object-contain"
            />
            <span className="text-muted-foreground text-sm">and</span>
            <Image
              src="/logos/intel.svg"
              alt="Intel"
              width={40}
              height={16}
              className="object-contain"
            />
          </div>

          {/* Description */}
          <div className="text-sm text-foreground leading-relaxed">
            <p>
              This automated verification tool lets you independently confirm
              that the model is running in the TEE (Trusted Execution
              Environment).
            </p>
          </div>

          {/* Related Links */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium text-foreground mb-3">
              Related Links
            </h3>
            <div className="space-y-2">
              <a
                href="https://docs.redpill.ai/confidential-ai/overview"
                className="flex items-center gap-2 text-primary hover:text-primary/80 text-xs"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
                How It Works
              </a>
              <a
                href="https://docs.redpill.ai/confidential-ai/attestation"
                className="flex items-center gap-2 text-primary hover:text-primary/80 text-xs"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
                TEE Attestation
              </a>
            </div>
          </div>
        </div>

        {/* Verify Button */}
        <div className="border-t pt-4">
          <Button
            onClick={() => selectedModel && verifyAttestation(selectedModel)}
            disabled={isVerifying || !selectedModel}
            variant="outline"
            className="w-full"
          >
            <RefreshCw
              className={cn("h-4 w-4 mr-2", isVerifying && "animate-spin")}
            />
            {isVerifying ? "Verifying..." : "Verify Again"}
          </Button>
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        </div>

        {/* Verification Status List */}
        <div className="space-y-3">
          <AttestationCard
            title="GPU Attestation"
            verified={
              !isVerifying && attestationData?.nvidia_payload !== undefined
            }
            loading={isVerifying}
            description={
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Image
                    src="/logos/nvidia.svg"
                    alt="NVIDIA"
                    width={60}
                    height={16}
                    className="object-contain"
                  />
                  <span className="text-xs text-muted-foreground">
                    Remote Attestation Service
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  This verification uses NVIDIA's Remote Attestation Service
                  (NRAS) to prove that your model is running on genuine NVIDIA
                  hardware in a secure environment. You can independently verify
                  the attestation evidence using NVIDIA's public API.
                </p>
                <div className="flex flex-col gap-2">
                  <a
                    href="https://docs.api.nvidia.com/attestation/reference/attestmultigpu"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Verify GPU attestation yourself
                  </a>
                  <a
                    href="https://docs.nvidia.com/attestation/index.html#overview"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Learn about NVIDIA Attestation
                  </a>
                </div>
              </div>
            }
            details={(() => {
              const payload = attestationData?.nvidia_payload
                ? parseNvidiaPayload(attestationData.nvidia_payload)
                : null;

              const curlCommand =
                payload?.arch && payload?.evidence_list && payload?.nonce
                  ? `curl --request POST \\
     --url https://nras.attestation.nvidia.com/v3/attest/gpu \\
     --header 'accept: application/json' \\
     --header 'content-type: application/json' \\
     --data '
{
  "nonce": "${payload.nonce}",
  "arch": "${payload.arch}",
  "evidence_list": ${typeof payload.evidence_list === "string" ? payload.evidence_list : JSON.stringify(payload.evidence_list, null, 2)}
}
'`
                  : "-";

              return {
                Nonce: payload?.nonce || "-",
                "Evidence List": payload?.evidence_list
                  ? JSON.stringify(payload.evidence_list, null, 2)
                  : "-",
                Architecture: payload?.arch || "-",
                "CURL Request": curlCommand,
              };
            })()}
            isExpanded={expandedItems.has(0)}
            onToggle={() => toggleItem(0)}
          />

          <AttestationCard
            title="TDX Attestation"
            verified={
              !isVerifying && attestationData?.intel_quote !== undefined
            }
            loading={isVerifying}
            description={
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Image
                    src="/logos/intel.svg"
                    alt="Intel"
                    width={40}
                    height={16}
                    className="object-contain"
                  />
                  <span className="text-xs text-muted-foreground">
                    Trust Domain Extensions
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Intel TDX (Trust Domain Extensions) provides hardware-based
                  attestation for confidential computing. You can verify the
                  authenticity of this TDX quote using Phala's TEE Attestation
                  Explorer - an open source tool for analyzing Intel attestation
                  reports.
                </p>
                <div className="flex flex-col gap-2">
                  <a
                    href="https://proof.t16z.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Verify TDX quote at TEE Explorer
                  </a>
                  <a
                    href="https://www.intel.com/content/www/us/en/developer/articles/technical/intel-trust-domain-extensions.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Learn about Intel TDX
                  </a>
                </div>
              </div>
            }
            details={{
              Quote: attestationData?.intel_quote || "-",
            }}
            isExpanded={expandedItems.has(1)}
            onToggle={() => toggleItem(1)}
          />
        </div>
      </div>
    </aside>
  );
};
