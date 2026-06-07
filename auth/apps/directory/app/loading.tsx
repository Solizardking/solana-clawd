import { Loader2 } from "lucide-react";
import { Nav } from "@/components/nav";

export default function Loading() {
  return (
    <div className="min-h-dvh flex flex-col">
      <Nav />
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="flex items-center gap-3 text-foreground/35">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <p className="text-[11px] font-mono uppercase tracking-wider">Loading…</p>
        </div>
      </div>
    </div>
  );
}
