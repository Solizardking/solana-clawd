import { SignInButton, UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { KeyRound } from "lucide-react";
import { RouterKeysClient } from "./router-keys-client";

export const dynamic = "force-dynamic";

export default async function RouterKeysPage() {
  const session = await auth();
  const signedIn = Boolean(session.userId);

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid size-8 place-items-center rounded-md border border-border bg-foreground text-background">
              <KeyRound className="size-4" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-none">ClawdRouter Keys</h1>
              <p className="mt-1 text-xs text-muted-foreground">Clerk-authenticated, Solana wallet-bound API access</p>
            </div>
          </div>
          {signedIn ? <UserButton /> : null}
        </div>
      </div>

      {!signedIn ? (
        <section className="mx-auto grid min-h-[70dvh] max-w-md place-items-center px-5">
          <div className="w-full border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">Sign in to manage router keys</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              API keys are issued only after Clerk authentication and a Solana wallet signature.
            </p>
            <SignInButton mode="modal">
              <button className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
                Sign in with Clerk
              </button>
            </SignInButton>
          </div>
        </section>
      ) : null}

      {signedIn ? (
        <RouterKeysClient />
      ) : null}
    </main>
  );
}
