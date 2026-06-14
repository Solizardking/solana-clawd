import { Link, useLocation } from "wouter";
import { Bot, MonitorSmartphone, ShieldCheck, Sparkles, Terminal, Wallet } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAuth } from "@/contexts/AuthContext";

type MobileRemoteControlProps = {
  hidden?: boolean;
};

const remoteRoutes = [
  { href: "/free", label: "Free", icon: Sparkles },
  { href: "/terminal", label: "Terminal", icon: Terminal },
  { href: "/remote", label: "Remote", icon: MonitorSmartphone },
  { href: "/agents", label: "Agents", icon: Bot },
] as const;

function routeIsActive(current: string, href: string) {
  if (href === "/") return current === "/";
  return current === href || current.startsWith(`${href}/`);
}

export function MobileRemoteControl({ hidden = false }: MobileRemoteControlProps) {
  const [location] = useLocation();
  const { connected } = useWallet();
  const { isAuthenticated, user } = useAuth();

  if (hidden) return null;

  const accountHref = isAuthenticated ? "/account" : "/token-gated";
  const accountLabel = isAuthenticated ? "Account" : connected ? "Sign" : "Wallet";
  const AccountIcon = isAuthenticated && user?.isTokenGated ? ShieldCheck : Wallet;
  const routes = [
    ...remoteRoutes,
    { href: accountHref, label: accountLabel, icon: AccountIcon },
  ];

  return (
    <nav
      aria-label="Mobile remote control"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-cyan-500/20 bg-black/95 px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(0,0,0,0.45)] backdrop-blur md:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
        {routes.map(({ href, label, icon: Icon }) => {
          const active = routeIsActive(location, href);
          return (
            <Link
              key={`${href}-${label}`}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-md border px-1 text-[10px] font-medium transition-colors ${
                active
                  ? "border-cyan-400/40 bg-cyan-400/15 text-cyan-100"
                  : "border-transparent text-zinc-400 hover:border-white/10 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="max-w-full truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
