"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "@/lib/auth-client";
import { useEffect, useState } from "react";
import { StripeAgentsLogo } from "@/components/icons";
import { Activity, Bot, Bell, Wallet, Settings, LogOut, Menu } from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Activity", icon: Activity },
  { href: "/dashboard/agents", label: "Agents", icon: Bot },
  { href: "/dashboard/approvals", label: "Approvals", icon: Bell },
  { href: "/dashboard/wallet", label: "Wallet", icon: Wallet },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!session && !isPending) router.push("/");
  }, [session, isPending, router]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (isPending || !session) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <svg className="animate-spin h-5 w-5 text-muted-foreground" viewBox="0 0 24 24" fill="none">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      </div>
    );
  }

  const initial = (session.user.name ?? session.user.email)?.[0]?.toUpperCase() ?? "?";

  return (
    <div className="flex h-dvh bg-sidebar-bg">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col bg-sidebar-bg transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2.5 px-6 h-14 shrink-0">
          <StripeAgentsLogo className="h-6 w-6 shrink-0" />
          <span className="text-[15px] font-semibold text-sidebar-active tracking-tight">
            Stripe Agents
          </span>
        </div>

        <div className="flex flex-col items-center py-6 px-6">
          <div
            className="h-16 w-16 rounded-full flex items-center justify-center text-white text-[24px] font-semibold"
            style={{ backgroundColor: "#533afe" }}
          >
            {initial}
          </div>
          <p className="mt-3 text-[15px] font-semibold text-sidebar-active">
            {session.user.name ?? "User"}
          </p>
          <p className="text-[13px] text-sidebar-fg">{session.user.email}</p>
        </div>

        <nav className="flex-1 px-3">
          {NAV.map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium transition-colors ${
                  isActive
                    ? "bg-sidebar-hover text-sidebar-active"
                    : "text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-active"
                }`}
              >
                <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-3 shrink-0">
          <button
            onClick={() => signOut().then(() => router.push("/"))}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-active transition-colors cursor-pointer"
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
            Log out
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col min-w-0 lg:my-2">
        <div className="flex flex-1 flex-col min-w-0 lg:rounded-l-2xl bg-background lg:shadow-lg lg:border lg:border-border/50 overflow-hidden">
          <header className="flex h-14 items-center gap-3 border-b border-border bg-background px-6 lg:hidden shrink-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Menu className="h-5 w-5" strokeWidth={1.75} />
            </button>
            <StripeAgentsLogo className="h-5 w-5" />
            <span className="text-[14px] font-semibold text-foreground tracking-tight">
              Stripe Agents
            </span>
          </header>
          <main className="flex-1 min-h-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
