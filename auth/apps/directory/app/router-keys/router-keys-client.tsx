"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, KeyRound, RefreshCw, Wallet } from "lucide-react";

type SolanaProvider = {
  isPhantom?: boolean;
  publicKey?: { toString(): string };
  connect(): Promise<{ publicKey: { toString(): string } }>;
  signMessage(message: Uint8Array, encoding?: "utf8"): Promise<{ signature: Uint8Array }>;
};

type UsageKey = {
  id: string;
  keyPrefix: string;
  name: string;
  walletAddress: string;
  ownerUserId?: string | null;
  ownerAuthProvider?: string | null;
  ownerTokenType?: string | null;
  holderTier: string;
  createdAt: string;
  monthlyLimitUSDC?: number | null;
  remainingUSDC?: number | null;
  usagePercent?: number | null;
  usage: {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    costUSDC: number;
  };
};

type UsageResponse = {
  usage?: {
    totalRequests: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUSDC: number;
  };
  localKeys?: UsageKey[];
};

declare global {
  interface Window {
    solana?: SolanaProvider;
    phantom?: { solana?: SolanaProvider };
  }
}

export function RouterKeysClient() {
  const [walletAddress, setWalletAddress] = useState("");
  const [label, setLabel] = useState("");
  const [monthlyLimitUSDC, setMonthlyLimitUSDC] = useState("");
  const [newKey, setNewKey] = useState("");
  const [status, setStatus] = useState("");
  const [usage, setUsage] = useState<UsageResponse>({});
  const [busy, setBusy] = useState(false);

  const provider = useMemo(() => {
    if (typeof window === "undefined") return null;
    return window.phantom?.solana ?? window.solana ?? null;
  }, []);

  useEffect(() => {
    void refreshUsage();
  }, []);

  async function connectWallet() {
    if (!provider) {
      setStatus("No Solana wallet provider found. Install Phantom or paste a wallet address.");
      return;
    }
    const result = await provider.connect();
    setWalletAddress(result.publicKey.toString());
    setStatus("Wallet connected.");
  }

  async function refreshUsage() {
    const response = await fetch("/api/router/usage", { cache: "no-store" });
    if (!response.ok) return;
    setUsage(await response.json());
  }

  async function issueKey() {
    setBusy(true);
    setNewKey("");
    setStatus("Preparing wallet challenge...");
    try {
      if (!walletAddress.trim()) throw new Error("Connect or paste a Solana wallet first.");
      if (!provider?.signMessage) throw new Error("A wallet with message signing is required.");

      const challengeResponse = await fetch("/api/router/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress }),
      });
      const challenge = await challengeResponse.json();
      if (!challengeResponse.ok) throw new Error(challenge.error ?? "Challenge failed.");

      setStatus("Sign the wallet challenge.");
      const encoded = new TextEncoder().encode(challenge.message);
      const signed = await provider.signMessage(encoded, "utf8");
      const signature = base58Encode(signed.signature);

      setStatus("Issuing holder API key...");
      const issueResponse = await fetch("/api/router/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress,
          challenge: challenge.token,
          signedMessage: challenge.message,
          signature,
          name: label || "Wallet key",
          monthlyLimitUSDC: monthlyLimitUSDC || null,
        }),
      });
      const issued = await issueResponse.json();
      if (!issueResponse.ok) throw new Error(issued.error?.message ?? issued.error ?? "Key issue failed.");

      setNewKey(issued.apiKey);
      setStatus("Key issued. Copy it now; it will not be shown again.");
      await refreshUsage();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to issue key.");
    } finally {
      setBusy(false);
    }
  }

  function copyKey() {
    if (!newKey) return;
    void navigator.clipboard.writeText(newKey);
    setStatus("Copied key.");
  }

  const keys = usage.localKeys ?? [];

  return (
    <div className="mx-auto max-w-6xl px-5 py-6">
      <section className="grid gap-3 sm:grid-cols-4">
        <Metric label="Requests" value={formatInt(usage.usage?.totalRequests)} />
        <Metric label="Input tokens" value={formatInt(usage.usage?.totalInputTokens)} />
        <Metric label="Output tokens" value={formatInt(usage.usage?.totalOutputTokens)} />
        <Metric label="Estimated spend" value={formatUSDC(usage.usage?.totalCostUSDC)} />
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-[360px_1fr]">
        <div className="border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Wallet className="size-4" />
            Wallet-bound key
          </h2>
          <div className="mt-4 space-y-3">
            <button
              type="button"
              onClick={connectWallet}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
            >
              <Wallet className="size-4" />
              Connect wallet
            </button>
            <Field label="Wallet address" value={walletAddress} onChange={setWalletAddress} placeholder="Solana wallet" />
            <Field label="Label" value={label} onChange={setLabel} placeholder="Desk, app, customer, user" />
            <Field label="Monthly USDC limit" value={monthlyLimitUSDC} onChange={setMonthlyLimitUSDC} placeholder="optional" type="number" />
            <button
              type="button"
              onClick={issueKey}
              disabled={busy}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-foreground px-3 text-sm font-medium text-background disabled:opacity-50"
            >
              <KeyRound className="size-4" />
              Issue API key
            </button>
            <p className="min-h-5 text-xs text-muted-foreground">{status}</p>
            {newKey ? (
              <div className="border border-border bg-background p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">New API key</span>
                  <button type="button" onClick={copyKey} className="inline-flex items-center gap-1 text-xs text-foreground/70">
                    <Copy className="size-3" />
                    Copy
                  </button>
                </div>
                <code className="block break-all text-xs">{newKey}</code>
              </div>
            ) : null}
          </div>
        </div>

        <div className="border border-border bg-card p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Issued keys</h2>
            <button type="button" onClick={refreshUsage} className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <RefreshCw className="size-3" />
              Refresh
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Owner</th>
                  <th className="py-2 pr-3 font-medium">Wallet</th>
                  <th className="py-2 pr-3 font-medium">Tier</th>
                  <th className="py-2 pr-3 font-medium">Usage</th>
                  <th className="py-2 pr-3 font-medium">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {keys.length ? keys.map((key) => <KeyRow key={key.id} apiKey={key} />) : (
                  <tr>
                    <td className="py-8 text-muted-foreground" colSpan={5}>No keys found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-2 text-xl font-semibold">{value}</div>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange(value: string): void;
  placeholder: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{props.label}</span>
      <input
        type={props.type ?? "text"}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        className="h-10 w-full border border-border bg-background px-3 text-sm outline-none focus:border-foreground/50"
      />
    </label>
  );
}

function KeyRow({ apiKey }: { apiKey: UsageKey }) {
  const used = apiKey.usage.costUSDC ?? 0;
  const limit = apiKey.monthlyLimitUSDC ?? null;
  const percent = apiKey.usagePercent ?? (limit ? Math.min(100, (used / limit) * 100) : 0);
  return (
    <tr className="border-b border-border/70">
      <td className="py-3 pr-3 align-top">
        <div className="font-medium">{apiKey.name}</div>
        {apiKey.ownerUserId ? <div className="text-xs text-muted-foreground">{apiKey.ownerAuthProvider ?? "auth"}:{apiKey.ownerUserId}</div> : null}
        <code className="text-xs text-muted-foreground">{apiKey.keyPrefix}...</code>
      </td>
      <td className="py-3 pr-3 align-top">
        <code className="break-all text-xs">{apiKey.walletAddress || "-"}</code>
      </td>
      <td className="py-3 pr-3 align-top">{apiKey.holderTier}</td>
      <td className="py-3 pr-3 align-top">
        <div>{formatInt(apiKey.usage.requests)} requests</div>
        <div className="text-xs text-muted-foreground">{formatInt(apiKey.usage.inputTokens)} in / {formatInt(apiKey.usage.outputTokens)} out</div>
        <div className="mt-1 text-xs">{formatUSDC(used)}</div>
        <div className="mt-2 h-2 w-40 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-foreground" style={{ width: `${percent}%` }} />
        </div>
      </td>
      <td className="py-3 pr-3 align-top">
        {limit === null ? "Unlimited" : formatUSDC(apiKey.remainingUSDC)}
        <div className="text-xs text-muted-foreground">{limit === null ? "No cap" : `${formatUSDC(limit)} cap`}</div>
      </td>
    </tr>
  );
}

function formatInt(value: number | undefined) {
  return Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatUSDC(value: number | null | undefined) {
  if (value === null || value === undefined) return "unlimited";
  return `$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 6 })}`;
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(bytes: Uint8Array) {
  let digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  for (const byte of bytes) {
    if (byte === 0) digits.push(0);
    else break;
  }
  return digits.reverse().map((digit) => BASE58[digit]).join("");
}
