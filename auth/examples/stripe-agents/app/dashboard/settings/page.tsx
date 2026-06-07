"use client";

import { useSession } from "@/lib/auth-client";
import { User, Mail } from "lucide-react";

export default function SettingsPage() {
  const { data: session } = useSession();

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-8 py-8">
        <h1 className="text-[20px] font-semibold text-foreground mb-6">Settings</h1>

        <div className="mb-8">
          <p className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Account
          </p>
          <div className="rounded-xl border border-border bg-white overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
              <div className="flex items-center gap-3">
                <User className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.75} />
                <span className="text-[14px] text-foreground">Name</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[14px] text-muted-foreground">
                  {session?.user.name ?? "—"}
                </span>
                <svg
                  className="h-4 w-4 text-muted-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.75}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
            <div className="flex items-center justify-between px-4 py-3.5">
              <div className="flex items-center gap-3">
                <Mail className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.75} />
                <span className="text-[14px] text-foreground">Email</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[14px] text-muted-foreground">
                  {session?.user.email ?? "—"}
                </span>
                <svg
                  className="h-4 w-4 text-muted-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.75}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
