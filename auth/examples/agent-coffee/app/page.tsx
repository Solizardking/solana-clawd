"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  priceCents: number;
  origin: string;
  roastLevel: string;
  inStock: boolean;
}

const ROAST_COLORS: Record<string, string> = {
  Light: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  Medium: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  Dark: "bg-stone-200 text-stone-800 dark:bg-stone-800/50 dark:text-stone-300",
};

export default function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((data) => setProducts(data.products))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <div className="max-w-[1000px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-lg">☕</span>
            <span className="text-[15px] font-semibold tracking-tight">Agent Coffee Shop</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-[13px] text-foreground/50 hover:text-foreground transition-colors"
            >
              My Orders
            </Link>
            <Link
              href="/sign-in"
              className="px-3 py-1.5 text-[13px] font-medium rounded-lg bg-foreground text-background hover:opacity-90 transition-all"
            >
              Sign In
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-[1000px] mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-[26px] font-semibold tracking-tight">Fresh Coffee Beans</h1>
          <p className="mt-1.5 text-[14px] text-foreground/45 max-w-lg">
            Single-origin beans from around the world. Accepts payments via MPP — AI agents can
            browse and buy programmatically.
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-border p-5 animate-pulse">
                <div className="h-4 w-40 bg-foreground/[0.06] rounded mb-3" />
                <div className="h-3 w-full bg-foreground/[0.04] rounded mb-2" />
                <div className="h-3 w-24 bg-foreground/[0.04] rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {products.map((p) => (
              <div
                key={p.id}
                className="group rounded-lg border border-border p-5 hover:border-foreground/20 transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h2 className="text-[15px] font-semibold">{p.name}</h2>
                    <p className="text-[12px] text-foreground/40 mt-0.5">{p.origin}</p>
                  </div>
                  <span className="text-[17px] font-semibold tabular-nums">
                    ${(p.priceCents / 100).toFixed(2)}
                  </span>
                </div>

                <p className="text-[13px] text-foreground/50 leading-relaxed mb-4">
                  {p.description}
                </p>

                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${ROAST_COLORS[p.roastLevel] ?? "bg-foreground/[0.06] text-foreground/50"}`}
                  >
                    {p.roastLevel} roast
                  </span>
                  <code className="text-[11px] font-mono text-foreground/30">
                    POST /api/products/{p.slug}/buy
                  </code>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-12 rounded-lg border border-dashed border-border p-6">
          <h3 className="text-[14px] font-semibold mb-2">For AI Agents</h3>
          <p className="text-[13px] text-foreground/45 mb-4">
            This shop accepts payments via the Machine Payments Protocol. Send a POST request to buy
            a product — you&apos;ll get a 402 challenge with payment details.
          </p>
          <div className="bg-foreground/[0.03] rounded-md p-3 font-mono text-[12px] text-foreground/60">
            <div className="text-foreground/30 mb-1"># Browse products</div>
            <div>curl &lt;origin&gt;/api/products</div>
            <div className="text-foreground/30 mt-3 mb-1">
              # Buy a product (returns 402 MPP challenge)
            </div>
            <div>curl -X POST &lt;origin&gt;/api/products/ethiopian-yirgacheffe/buy</div>
          </div>
        </div>
      </main>
    </div>
  );
}
