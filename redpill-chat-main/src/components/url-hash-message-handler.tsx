"use client";

import { useComposerRuntime } from "@assistant-ui/react";
import { useEffect, useRef } from "react";

export function UrlHashMessageHandler() {
  const composerRuntime = useComposerRuntime();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current || typeof window === "undefined") {
      return;
    }

    const processHashMessage = () => {
      try {
        const hash = window.location.hash;

        if (!hash || hash.length <= 1) {
          return;
        }

        const encodedMessage = hash.slice(1);

        try {
          const decodedMessage = atob(encodedMessage);

          if (decodedMessage) {
            console.log("Processing message from URL hash", {
              component: "UrlHashMessageHandler",
              messageLength: decodedMessage.length,
            });

            hasProcessed.current = true;

            composerRuntime.setText(decodedMessage);
            composerRuntime.send();

            window.history.replaceState(
              null,
              "",
              window.location.pathname + window.location.search,
            );
          }
        } catch (decodeError) {
          console.warn("Invalid base64 encoding in URL hash", {
            component: "UrlHashMessageHandler",
            error:
              decodeError instanceof Error
                ? decodeError.message
                : "Unknown error",
          });
        }
      } catch (error) {
        console.error("Failed to process URL hash message", error, {
          component: "UrlHashMessageHandler",
        });
      }
    };

    processHashMessage();
  }, [composerRuntime]);

  return null;
}
