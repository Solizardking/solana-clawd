"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useRouter, useSearchParams } from "next/navigation";

type ApprovalMethod = "device_authorization" | "ciba";

interface Settings {
  freshSessionEnabled: boolean;
  freshSessionWindow: number;
  preferredApprovalMethod: ApprovalMethod;
  webauthnEnabled: boolean;
  defaultHostCapabilities: string[];
}

const DEFAULT_SETTINGS: Settings = {
  freshSessionEnabled: false,
  freshSessionWindow: 300,
  preferredApprovalMethod: "ciba",
  webauthnEnabled: false,
  defaultHostCapabilities: [],
};

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setupPasskey = searchParams.get("setup_passkey") === "true";
  const returnTo = searchParams.get("return_to");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load settings (${r.status})`);
        return r.json();
      })
      .then((data) => {
        if (data && !data.error) {
          setSettings(data);
        } else {
          setSettings(DEFAULT_SETTINGS);
        }
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : "Failed to load settings");
        setSettings(DEFAULT_SETTINGS);
      });
  }, []);

  const save = async (patch: Partial<Settings>) => {
    const next = { ...settings!, ...patch };
    setSettings(next);
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <div className="h-6 w-32 animate-pulse rounded-xl bg-surface" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-[22px] font-normal text-foreground">Settings</h1>
          <p className="mt-1 text-sm text-muted">
            Configure security and approval settings for Agent Auth.
          </p>
          {loadError && (
            <p className="mt-2 text-xs text-red-500">
              {loadError}. Showing defaults &mdash; changes will be saved normally.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
            Session Security
          </h2>
          <div className="rounded-2xl border border-border bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-5 py-5">
              <div className="flex-1 pr-4">
                <p className="text-sm font-medium text-foreground">
                  Require fresh session for approvals
                </p>
                <p className="mt-1 text-xs text-muted">
                  When enabled, users must have signed in recently to approve agent capability
                  requests.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.freshSessionEnabled}
                onClick={() => save({ freshSessionEnabled: !settings.freshSessionEnabled })}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  settings.freshSessionEnabled ? "bg-accent" : "bg-gray-300"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transition-transform ${
                    settings.freshSessionEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {settings.freshSessionEnabled && (
              <div className="flex items-center justify-between px-5 py-5">
                <div className="flex-1 pr-4">
                  <p className="text-sm font-medium text-foreground">Session window</p>
                  <p className="mt-1 text-xs text-muted">
                    Maximum age (in seconds) of the session at time of approval.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={30}
                    max={86400}
                    value={settings.freshSessionWindow}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s!,
                        freshSessionWindow: parseInt(e.target.value, 10) || 300,
                      }))
                    }
                    onBlur={() => save({ freshSessionWindow: settings.freshSessionWindow })}
                    className="w-24 rounded-lg border border-border bg-white px-3 py-1.5 text-right text-sm text-foreground outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
                  />
                  <span className="text-xs text-muted">sec</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
            Approval Method
          </h2>
          <div className="rounded-2xl border border-border bg-white shadow-sm">
            <div className="px-5 py-5">
              <p className="text-sm font-medium text-foreground">Preferred approval method</p>
              <p className="mt-1 text-xs text-muted">
                Choose how agents request user approval for capabilities.
              </p>
              <div className="mt-4 flex gap-3">
                {(
                  [
                    {
                      value: "device_authorization",
                      label: "Device Authorization",
                      desc: "User enters a code on a verification page",
                    },
                    {
                      value: "ciba",
                      label: "CIBA (Backchannel)",
                      desc: "Server pushes approval request to the user",
                    },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => save({ preferredApprovalMethod: opt.value })}
                    className={`flex flex-1 flex-col rounded-xl border-2 px-4 py-3.5 text-left transition-all ${
                      settings.preferredApprovalMethod === opt.value
                        ? "border-accent bg-accent/5"
                        : "border-border hover:border-muted"
                    }`}
                  >
                    <span
                      className={`text-sm font-medium ${
                        settings.preferredApprovalMethod === opt.value
                          ? "text-accent"
                          : "text-muted"
                      }`}
                    >
                      {opt.label}
                    </span>
                    <span className="mt-0.5 text-xs text-muted">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <DefaultHostCapabilitiesEditor
          value={settings.defaultHostCapabilities}
          onChange={(caps) => save({ defaultHostCapabilities: caps })}
        />

        <div className="flex flex-col gap-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
            Proof of Presence (WebAuthn)
          </h2>
          {setupPasskey && (
            <div className="rounded-2xl border border-accent/30 bg-accent/5 px-5 py-4">
              <p className="text-sm font-medium text-accent">Passkey required</p>
              <p className="mt-1 text-xs text-muted">
                The capabilities you&apos;re approving require biometric verification. Register a
                passkey below, then you&apos;ll be redirected back to complete the approval.
              </p>
            </div>
          )}
          <div className="rounded-2xl border border-border bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-5 py-5">
              <div className="flex-1 pr-4">
                <p className="text-sm font-medium text-foreground">
                  Require biometric verification for sensitive actions
                </p>
                <p className="mt-1 text-xs text-muted">
                  When enabled, capabilities marked with{" "}
                  <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">
                    approvalStrength: &quot;webauthn&quot;
                  </code>{" "}
                  will require a passkey (fingerprint / Face ID) to approve. This prevents AI agents
                  with browser access from self-approving.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.webauthnEnabled}
                onClick={() =>
                  save({
                    webauthnEnabled: !settings.webauthnEnabled,
                  })
                }
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  settings.webauthnEnabled ? "bg-accent" : "bg-gray-300"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transition-transform ${
                    settings.webauthnEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {(settings.webauthnEnabled || setupPasskey) && <PasskeyManager returnTo={returnTo} />}
          </div>
        </div>

        {(saving || saved) && (
          <p className="text-xs text-muted">{saving ? "Saving…" : "Settings saved."}</p>
        )}

        <div className="flex flex-col gap-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-red-400">Danger Zone</h2>
          <div className="rounded-2xl border border-red-200 bg-white shadow-sm">
            <div className="flex items-center justify-between px-5 py-5">
              <div className="flex-1 pr-4">
                <p className="text-sm font-medium text-foreground">Delete account</p>
                <p className="mt-1 text-xs text-muted">
                  Permanently delete your account, all connected agents, and revoke all
                  capabilities. This action cannot be undone.
                </p>
              </div>
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="shrink-0 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                >
                  Delete account
                </button>
              ) : (
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmDelete(false);
                      setDeleteError(null);
                    }}
                    disabled={deleting}
                    className="rounded-lg border border-border px-3 py-2 text-sm text-muted transition-colors hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={async () => {
                      setDeleting(true);
                      setDeleteError(null);
                      await authClient.deleteUser({
                        fetchOptions: {
                          onSuccess: () => {
                            router.push("/");
                          },
                          onError: (ctx) => {
                            setDeleteError(ctx.error.message ?? "Failed to delete account");
                            setDeleting(false);
                            setConfirmDelete(false);
                          },
                        },
                      });
                    }}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleting ? "Deleting…" : "Yes, delete my account"}
                  </button>
                </div>
              )}
            </div>
            {deleteError && (
              <div className="border-t border-red-100 px-5 py-3">
                <p className="text-xs text-red-600">{deleteError}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DefaultHostCapabilitiesEditor({
  value,
  onChange,
}: {
  value: string[] | null;
  onChange: (caps: string[]) => void;
}) {
  const [availableCaps, setAvailableCaps] = useState<{ name: string; description: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const startEditing = async () => {
    setEditing(true);
    setSelected(new Set(value ?? []));
    setLoading(true);
    try {
      const res = await fetch("/api/auth/capability/list?limit=500");
      if (res.ok) {
        const data = await res.json();
        setAvailableCaps(data.capabilities ?? []);
      }
    } catch {}
    setLoading(false);
  };

  const handleSave = () => {
    onChange([...selected]);
    setEditing(false);
  };

  const caps = value ?? [];

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
        Default Host Capabilities
      </h2>
      <div className="rounded-2xl border border-border bg-white shadow-sm">
        <div className="px-5 py-5">
          <div className="flex items-start justify-between">
            <div className="flex-1 pr-4">
              <p className="text-sm font-medium text-foreground">
                Auto-granted capabilities for new hosts
              </p>
              <p className="mt-1 text-xs text-muted">
                Capabilities automatically granted when a new agent host connects.
              </p>
            </div>
            {!editing && (
              <button
                type="button"
                onClick={startEditing}
                className="shrink-0 rounded-full border border-border px-3 py-1 text-[11px] font-medium text-muted transition-colors hover:text-foreground hover:bg-surface"
              >
                Edit
              </button>
            )}
          </div>

          {editing ? (
            <div className="mt-4">
              {loading ? (
                <div className="flex justify-center py-6">
                  <svg className="animate-spin h-5 w-5 text-muted" viewBox="0 0 24 24" fill="none">
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
              ) : (
                <>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs text-muted">
                      {selected.size} of {availableCaps.length} selected
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setSelected(
                          selected.size === availableCaps.length
                            ? new Set()
                            : new Set(availableCaps.map((c) => c.name)),
                        )
                      }
                      className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted transition-colors hover:text-foreground"
                    >
                      {selected.size === availableCaps.length ? "Deselect all" : "Select all"}
                    </button>
                  </div>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {availableCaps.map((cap) => {
                      const isSelected = selected.has(cap.name);
                      return (
                        <label
                          key={cap.name}
                          className={`flex items-center gap-3 rounded-xl px-3 py-2 cursor-pointer transition-colors ${
                            isSelected
                              ? "bg-accent/10 ring-1 ring-accent/20"
                              : "bg-surface hover:bg-surface-hover"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (next.has(cap.name)) next.delete(cap.name);
                                else next.add(cap.name);
                                return next;
                              });
                            }}
                            className="h-3.5 w-3.5 rounded accent-gmail-blue"
                          />
                          <div className="flex-1 min-w-0">
                            <code className="text-xs font-mono text-foreground truncate block">
                              {cap.name}
                            </code>
                            {cap.description && (
                              <p className="text-[11px] text-muted truncate">{cap.description}</p>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSave}
                      className="rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : caps.length > 0 ? (
            <div className="mt-3 space-y-1">
              {caps.map((cap) => (
                <div key={cap} className="rounded-xl bg-surface px-3 py-2">
                  <code className="text-xs font-mono text-foreground">{cap}</code>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted">
              No capabilities auto-granted. Hosts will start with no default access.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function PasskeyManager({ returnTo }: { returnTo?: string | null }) {
  const [passkeys, setPasskeys] = useState<
    { id: string; name?: string | null; createdAt?: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPasskeys = async () => {
    try {
      const res = await fetch("/api/auth/passkey/list-user-passkeys");
      if (res.ok) {
        const data = await res.json();
        setPasskeys(Array.isArray(data) ? data : []);
      }
    } catch {
      // passkey table might not exist yet
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPasskeys();
  }, []);

  const handleRegister = async () => {
    setRegistering(true);
    setError(null);
    try {
      const res = await authClient.passkey.addPasskey({
        name: `Agent Auth Key ${new Date().toLocaleDateString()}`,
      });
      if (res?.error) {
        setError(res.error.message ?? "Registration failed");
      } else {
        await fetchPasskeys();
        if (returnTo) {
          window.location.href = returnTo;
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Passkey registration cancelled or failed";
      if (!msg.includes("cancelled") && !msg.includes("abort")) {
        setError(msg);
      }
    } finally {
      setRegistering(false);
    }
  };

  return (
    <div className="px-5 py-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Your passkeys</p>
          <p className="mt-1 text-xs text-muted">
            Register at least one passkey to enable biometric approvals.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRegister}
          disabled={registering}
          className="rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {registering ? "Registering…" : "+ Add Passkey"}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      {loading ? (
        <div className="mt-3 h-8 w-full animate-pulse rounded-lg bg-gray-100" />
      ) : passkeys.length === 0 ? (
        <p className="mt-3 text-xs text-amber-600">
          No passkeys registered. WebAuthn approvals will fail until you add one.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {passkeys.map((pk) => (
            <li key={pk.id} className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm text-foreground">{pk.name ?? "Unnamed passkey"}</p>
                {pk.createdAt && (
                  <p className="text-[11px] text-muted">
                    Added {new Date(pk.createdAt).toLocaleDateString()}
                  </p>
                )}
              </div>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-muted">
                FIDO2
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
