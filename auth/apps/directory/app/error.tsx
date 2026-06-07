"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Route error:", error);
  }, [error]);

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-5 text-center">
      <div className="relative">
        <div
          className="absolute inset-0 pointer-events-none select-none -m-32"
          aria-hidden="true"
          style={{
            backgroundImage: `
              linear-gradient(to right, var(--foreground) 1px, transparent 1px),
              linear-gradient(to bottom, var(--foreground) 1px, transparent 1px)
            `,
            backgroundSize: "40px 40px",
            opacity: 0.03,
            maskImage: "radial-gradient(ellipse 60% 60% at 50% 50%, black 10%, transparent 70%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 60% 60% at 50% 50%, black 10%, transparent 70%)",
          }}
        />

        <div className="relative space-y-6 max-w-md">
          <AlertTriangle className="h-7 w-7 text-foreground/30 mx-auto" aria-hidden="true" />

          <div className="space-y-2">
            <p className="text-[11px] font-mono uppercase tracking-[0.3em] text-foreground/30">
              500 — Internal Error
            </p>
            <h1 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight">
              Something went wrong
            </h1>
            <p className="text-sm text-foreground/40 max-w-sm mx-auto leading-relaxed">
              An unexpected error occurred while loading this page. Try again, or head back to the
              directory.
            </p>
            {error.digest && (
              <p className="text-[10px] font-mono text-foreground/25 pt-2 break-all">
                digest: {error.digest}
              </p>
            )}
          </div>

          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-2 border border-foreground/[0.12] bg-foreground/[0.04] hover:bg-foreground/[0.08] hover:border-foreground/[0.20] px-4 py-2 transition-all text-xs font-mono text-foreground/60"
            >
              <RefreshCw className="h-3 w-3" />
              Try again
            </button>
            <Link
              href="/"
              className="border border-foreground/[0.12] bg-foreground/[0.04] hover:bg-foreground/[0.08] hover:border-foreground/[0.20] px-4 py-2 transition-all text-xs font-mono text-foreground/60"
            >
              Home
            </Link>
          </div>

          <p className="text-[10px] font-mono text-foreground/20">AGENT-AUTH — Directory</p>
        </div>
      </div>
    </div>
  );
}
