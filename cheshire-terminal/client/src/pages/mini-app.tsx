import { useMemo } from "react";
import { Link } from "wouter";
import { MessageCircle, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TelegramMiniApp } from "@/components/TelegramMiniApp";

function getTelegramInitData() {
  const params = new URLSearchParams(window.location.search);
  return (
    window.Telegram?.WebApp?.initData ||
    params.get("tgWebAppData") ||
    params.get("initData") ||
    ""
  );
}

export default function MiniAppPage() {
  const telegramInitData = useMemo(() => getTelegramInitData(), []);

  return (
    <div className="min-h-screen-dynamic bg-black px-3 py-4 text-white">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <header className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-cyan-200">
              <MessageCircle className="h-4 w-4" />
              Cheshire Terminal
            </div>
            <h1 className="truncate text-2xl font-black tracking-tight text-white">
              Mobile Remote
            </h1>
          </div>
          <Link href="/free">
            <Button size="sm" variant="outline" className="h-9 gap-2 border-cyan-400/30 text-cyan-100 hover:bg-cyan-500/10">
              <Terminal className="h-4 w-4" />
              Free
            </Button>
          </Link>
        </header>

        <TelegramMiniApp telegramInitData={telegramInitData} />
      </div>
    </div>
  );
}
