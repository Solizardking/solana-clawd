"use client";

import type { FC } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { RIGHT_PANEL_WIDTH } from "@/constants";
import { getTinfoilClient } from "@/lib/tinfoil-client";
import { cn } from "@/lib/utils";

interface TinfoilVerifierSidebarProps {
  isVisible: boolean;
  onClose: () => void;
  onVerificationUpdate?: (state: unknown) => void;
  onVerificationComplete?: (success: boolean) => void;
}

export const TinfoilVerifierSidebar: FC<TinfoilVerifierSidebarProps> = ({
  isVisible,
  onClose,
  onVerificationUpdate,
  onVerificationComplete,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [verificationDocument, setVerificationDocument] =
    useState<unknown>(null);

  const fetchVerificationDocument = useCallback(async () => {
    try {
      const client = await getTinfoilClient();
      const readyFn = (client as { ready?: () => Promise<unknown> }).ready;
      await readyFn?.call(client);
    } catch (error) {
      console.error("Tinfoil client verification failed", error);
    }

    try {
      const client = await getTinfoilClient();
      const doc = await (
        client as { getVerificationDocument?: () => Promise<unknown> }
      ).getVerificationDocument?.call(client);
      if (doc) {
        setVerificationDocument(doc);
        onVerificationUpdate?.(doc);
        const { securityVerified } = doc as { securityVerified?: boolean };
        if (securityVerified !== undefined) {
          onVerificationComplete?.(securityVerified);
        }
        if (isReady && iframeRef.current) {
          iframeRef.current.contentWindow?.postMessage(
            {
              type: "TINFOIL_VERIFICATION_DOCUMENT",
              document: doc,
            },
            "*",
          );
        }
      }
    } catch (error) {
      console.error("Failed to fetch verification document", error);
    }
  }, [isReady, onVerificationComplete, onVerificationUpdate]);

  // Handle messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === "TINFOIL_VERIFICATION_CENTER_READY") {
        setIsReady(true);
        // Send verification document if we have it
        if (verificationDocument && iframeRef.current) {
          iframeRef.current.contentWindow?.postMessage(
            {
              type: "TINFOIL_VERIFICATION_DOCUMENT",
              document: verificationDocument,
            },
            "*",
          );
        }
      } else if (event.data.type === "TINFOIL_VERIFICATION_CENTER_CLOSED") {
        onClose();
      } else if (event.data.type === "TINFOIL_REQUEST_VERIFICATION_DOCUMENT") {
        // Refresh the verification document
        fetchVerificationDocument();
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [verificationDocument, onClose, fetchVerificationDocument]);

  // Fetch verification document when sidebar opens
  useEffect(() => {
    if (isVisible) {
      fetchVerificationDocument();
    }
  }, [isVisible, fetchVerificationDocument]);

  // Control open/close state
  useEffect(() => {
    if (isReady && iframeRef.current) {
      const message = isVisible
        ? { type: "TINFOIL_VERIFICATION_CENTER_OPEN" }
        : { type: "TINFOIL_VERIFICATION_CENTER_CLOSE" };
      iframeRef.current.contentWindow?.postMessage(message, "*");
    }
  }, [isVisible, isReady]);

  const iframeUrl =
    "https://verification-center.tinfoil.sh?showVerificationFlow=true&compact=false&open=true";

  return (
    <aside
      className={cn(
        "fixed inset-y-0 right-0 z-30 border-l border-border bg-background transition-transform duration-250 ease-in-out",
        isVisible
          ? "pointer-events-auto translate-x-0 opacity-100"
          : "pointer-events-none translate-x-full opacity-0",
      )}
      aria-hidden={!isVisible}
      style={{ maxWidth: RIGHT_PANEL_WIDTH }}
    >
      <iframe
        ref={iframeRef}
        src={iframeUrl}
        className="h-screen w-full"
        style={{ border: "none" }}
        title="Tinfoil Verification Center"
      />
    </aside>
  );
};
