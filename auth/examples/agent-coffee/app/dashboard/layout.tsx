"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "@/lib/auth-client";
import { useEffect } from "react";

const NAV = [
  { href: "/dashboard", label: "Orders" },
  { href: "/dashboard/agents", label: "Agents" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!session && !isPending) router.push("/sign-in");
  }, [session, isPending, router]);

  if (isPending || !session) return null;

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <div className="max-w-[1000px] mx-auto px-6">
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-2.5">
              <span className="text-lg">☕</span>
              <span className="text-[14px] font-semibold tracking-tight">Agent Coffee Shop</span>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="text-[12px] text-foreground/40 hover:text-foreground transition-colors"
              >
                Catalog
              </Link>
              <span className="text-[12px] text-foreground/40">{session.user.email}</span>
              <button
                onClick={() => signOut().then(() => router.push("/"))}
                className="text-[12px] text-foreground/40 hover:text-foreground transition-colors cursor-pointer"
              >
                Sign out
              </button>
            </div>
          </div>
          <nav className="flex gap-0.5 -mb-px">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-2 text-[13px] font-medium border-b-2 transition-colors ${
                    active
                      ? "border-foreground text-foreground"
                      : "border-transparent text-foreground/45 hover:text-foreground/70"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
