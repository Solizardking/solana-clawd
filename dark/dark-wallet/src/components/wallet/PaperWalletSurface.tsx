import { useEffect, useMemo, useState } from "react";
import { createDarkClawdAgent } from "../../lib/dark-clawd-agent";
import {
  formatNetworkLabel,
  type DarkNetwork,
  type DarkRuntimeConfig,
} from "../../lib/runtime";
import {
  formatSol,
  stagePrivatePayment,
  type DarkVaultState,
  type PrivatePaymentRail,
  type PrivatePaymentSettlement,
} from "../../lib/dark-protocol";
import {
  generateSolanaPaperWallet,
  paperWalletFileName,
  serializeSolanaPaperWallet,
  summarisePaperWallet,
  type SolanaPaperWallet,
} from "../../lib/paper-wallet";

type StatusTone = "neutral" | "success" | "warning" | "danger";
type ProofLayer = "solana" | "evm";

interface PaperWalletSurfaceProps {
  network: DarkNetwork;
  runtime: DarkRuntimeConfig;
  vault: DarkVaultState;
  persistVault: (next: DarkVaultState) => void;
  onStatus: (tone: StatusTone, title: string, body: string) => void;
  walletAddress?: string | null;
}

const PAYMENT_RAILS: Array<{ value: PrivatePaymentRail; label: string; note: string }> = [
  {
    value: "x402",
    label: "x402",
    note: "HTTP 402 settlement rail with durable wallet receipts.",
  },
  {
    value: "ap2",
    label: "AP2",
    note: "Agent-to-agent payment primitive for policy-gated execution.",
  },
  {
    value: "m2m",
    label: "M2M",
    note: "Machine-to-machine payment route for automated flows.",
  },
];

const SETTLEMENTS: Array<{ value: PrivatePaymentSettlement; label: string }> = [
  { value: "solana", label: "Solana" },
  { value: "evm", label: "EVM proof" },
];

const PROOF_LAYERS: Array<{ value: ProofLayer; label: string }> = [
  { value: "solana", label: "Solana" },
  { value: "evm", label: "EVM" },
];

function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }

  return Promise.reject(new Error("Clipboard access unavailable"));
}

function downloadJson(filename: string, content: string): void {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function PaperWalletSurface({
  network,
  runtime,
  vault,
  persistVault,
  onStatus,
  walletAddress,
}: PaperWalletSurfaceProps) {
  const [label, setLabel] = useState("Dark Solana paper wallet");
  const [entropy, setEntropy] = useState("");
  const [wallet, setWallet] = useState<SolanaPaperWallet | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [agentPrompt, setAgentPrompt] = useState(
    "Review the cold-storage setup and call out any operational risks.",
  );
  const [agentResponse, setAgentResponse] = useState("");
  const [isAskingAgent, setIsAskingAgent] = useState(false);
  const [paymentRail, setPaymentRail] = useState<PrivatePaymentRail>("x402");
  const [settlement, setSettlement] = useState<PrivatePaymentSettlement>("solana");
  const [proofLayer, setProofLayer] = useState<ProofLayer>("evm");
  const [durable, setDurable] = useState(true);
  const [paymentRecipient, setPaymentRecipient] = useState("private-counterparty");
  const [paymentAmount, setPaymentAmount] = useState("0.25");
  const [paymentMemo, setPaymentMemo] = useState("Private settlement");

  const agent = useMemo(
    () =>
      createDarkClawdAgent(runtime.xaiApiKey, {
        baseUrl: runtime.xaiBaseUrl,
        model: runtime.xaiModel,
        temperature: 0.2,
      }),
    [runtime],
  );

  useEffect(() => {
    if (walletAddress && paymentRecipient === "private-counterparty") {
      setPaymentRecipient(walletAddress);
    }
  }, [paymentRecipient, walletAddress]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const next = await generateSolanaPaperWallet({
        label,
        network,
        entropy,
      });
      setWallet(next);
      setShowSecret(false);
      setAgentResponse("");
      onStatus(
        "success",
        "Paper wallet generated",
        `${next.publicKey.slice(0, 8)}… is ready for print on ${formatNetworkLabel(network)}.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Paper wallet generation failed";
      onStatus("danger", "Paper wallet failed", message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrint = () => {
    if (!wallet) {
      onStatus("warning", "No paper wallet yet", "Generate a wallet before printing.");
      return;
    }

    setShowSecret(true);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.print();
      });
    });
  };

  const handleDownload = () => {
    if (!wallet) {
      onStatus("warning", "No paper wallet yet", "Generate a wallet before downloading.");
      return;
    }

    const filename = paperWalletFileName(wallet);
    downloadJson(filename, serializeSolanaPaperWallet(wallet));
    onStatus("success", "Paper wallet downloaded", `${filename} is on your disk.`);
  };

  const handleCopyAddress = async () => {
    if (!wallet) {
      return;
    }

    try {
      await copyText(wallet.publicKey);
      onStatus("success", "Address copied", `${wallet.publicKey.slice(0, 8)}… is on the clipboard.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Clipboard copy failed";
      onStatus("warning", "Copy failed", message);
    }
  };

  const handleCopySecret = async () => {
    if (!wallet || !showSecret) {
      onStatus("warning", "Secret hidden", "Reveal the secret key before copying it.");
      return;
    }

    try {
      await copyText(wallet.secretKeyJson);
      onStatus("warning", "Secret copied", "Treat the clipboard as sensitive and clear it after use.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Clipboard copy failed";
      onStatus("warning", "Copy failed", message);
    }
  };

  const handleAskAgent = async () => {
    if (!agent) {
      onStatus(
        "warning",
        "xAI not configured",
        "Set XAI_API_KEY to enable the Dark Clawd review sidecar.",
      );
      return;
    }

    setIsAskingAgent(true);
    try {
      const review = wallet
        ? await agent.reviewWallet(wallet, {
            paymentRail,
            settlement,
            durable,
            proofLayer,
            prompt: agentPrompt,
          })
        : await agent.chat(
            [
              "Explain how to safely prepare a Solana paper wallet offline.",
              `Network preference: ${formatNetworkLabel(network)}.`,
              `Payment rail preference: ${paymentRail}.`,
              `Proof layer preference: ${proofLayer}.`,
              agentPrompt,
            ].join("\n"),
          );

      setAgentResponse(review || "No agent response returned.");
      onStatus("success", "Dark Clawd reviewed the setup", "The xAI sidecar returned a security brief.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "xAI review failed";
      setAgentResponse("");
      onStatus("danger", "Agent review failed", message);
    } finally {
      setIsAskingAgent(false);
    }
  };

  const handleStagePayment = () => {
    try {
      const amount = Number(paymentAmount);
      const recipient = paymentRecipient.trim() || "private-counterparty";
      const next = stagePrivatePayment(
        vault,
        amount,
        recipient,
        paymentRail,
        settlement,
        durable,
        proofLayer,
        paymentMemo,
      );
      persistVault(next.state);
      onStatus(
        "success",
        "Private payment staged",
        `${formatSol(amount)} queued via ${paymentRail.toUpperCase()} on ${settlement.toUpperCase()} with ${proofLayer.toUpperCase()} proofing.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Private payment failed";
      onStatus("danger", "Private payment blocked", message);
    }
  };

  const latestAction = vault.history[0] ?? null;

  return (
    <div className="surface-stack paper-surface">
      <div className="info-grid paper-layout">
        <section className="surface-card paper-card">
          <div className="surface-card-header">
            <h4>Solana paper wallet</h4>
            <span className="surface-badge surface-badge-cool">
              {wallet ? "ready" : "offline"}
            </span>
          </div>
          <p className="mini-copy">
            A browser-local Solana paper wallet patterned after the Zcash paper-wallet flow:
            typed entropy, printable output, and a cold-storage secret that never touches RPC.
          </p>
          <div className="field-grid">
            <div className="field">
              <label htmlFor="paper-label">Label</label>
              <input
                id="paper-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Dark Solana paper wallet"
              />
            </div>
            <div className="field">
              <label htmlFor="paper-network">Network</label>
              <select
                id="paper-network"
                value={network}
                disabled
              >
                <option value={network}>{formatNetworkLabel(network)}</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="paper-entropy">Extra entropy</label>
            <textarea
              id="paper-entropy"
              value={entropy}
              onChange={(event) => setEntropy(event.target.value)}
              placeholder="Type random characters here for extra local entropy"
            />
          </div>
          <div className="surface-actions">
            <button className="primary-button" onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? "Generating..." : "Generate paper wallet"}
            </button>
            <button className="ghost-button" onClick={handlePrint} disabled={!wallet}>
              Print sheet
            </button>
            <button className="ghost-button" onClick={handleDownload} disabled={!wallet}>
              Download JSON
            </button>
          </div>

          {wallet ? (
            <div className="paper-sheet">
              <div className="paper-sheet-head">
                <span className="mini-status mini-simulated">cold storage</span>
                <span>{wallet.entropyNote}</span>
              </div>

              <div className="quote-card">
                <div className="quote-row">
                  <span>Network</span>
                  <strong>{formatNetworkLabel(wallet.network)}</strong>
                </div>
                <div className="quote-row">
                  <span>Label</span>
                  <strong>{wallet.label}</strong>
                </div>
                <div className="quote-row">
                  <span>Public key</span>
                  <strong className="paper-mono">{wallet.publicKey}</strong>
                </div>
                <div className="quote-row">
                  <span>Fingerprint</span>
                  <strong>{wallet.publicFingerprint}</strong>
                </div>
              </div>

              <div className="paper-secret">
                <div className="surface-card-header">
                  <h4>Secret key JSON</h4>
                  <button className="ghost-button" onClick={() => setShowSecret((value) => !value)}>
                    {showSecret ? "Hide" : "Reveal"}
                  </button>
                </div>
                <textarea
                  className="paper-secret-text"
                  readOnly
                  value={showSecret ? wallet.secretKeyJson : "[hidden until reveal]"}
                />
                <div className="surface-actions">
                  <button className="ghost-button" onClick={handleCopyAddress}>
                    Copy address
                  </button>
                  <button className="ghost-button" onClick={handleCopySecret} disabled={!showSecret}>
                    Copy secret
                  </button>
                </div>
              </div>

              <div className="paper-meta">
                <div>
                  <span className="metric-label">Created</span>
                  <strong>{new Date(wallet.createdAt).toLocaleString()}</strong>
                </div>
                <div>
                  <span className="metric-label">Seed fingerprint</span>
                  <strong>{wallet.seedFingerprint}</strong>
                </div>
              </div>
            </div>
          ) : (
            <div className="paper-sheet paper-sheet-empty">
              <p className="mini-copy">
                Generate a paper wallet to create a printable cold-storage sheet.
              </p>
            </div>
          )}
        </section>

        <section className="surface-card paper-card">
          <div className="surface-card-header">
            <h4>Dark Clawd sidecar</h4>
            <span className={`surface-badge ${agent ? "surface-badge-cool" : ""}`}>
              {agent ? "xAI ready" : "xAI offline"}
            </span>
          </div>
          <p className="mini-copy">
            Optional agent sidecar for reviewing the paper-wallet posture and the private-payment
            primitive. It only sees public metadata and operator instructions.
          </p>
          <div className="field">
            <label htmlFor="agent-prompt">Operator prompt</label>
            <textarea
              id="agent-prompt"
              value={agentPrompt}
              onChange={(event) => setAgentPrompt(event.target.value)}
              placeholder="Ask Dark Clawd to review storage, transport, or payment posture."
            />
          </div>
          <div className="surface-actions">
            <button className="primary-button" onClick={handleAskAgent} disabled={isAskingAgent}>
              {isAskingAgent ? "Thinking..." : "Ask Dark Clawd"}
            </button>
          </div>
          <div className="agent-response">
            <span className="metric-label">Agent response</span>
            <p>{agentResponse || "Run a review to get a security brief."}</p>
          </div>
          <div className="info-grid compact">
            <article className="info-card">
              <p className="info-eyebrow">Network</p>
              <h4>{formatNetworkLabel(network)}</h4>
              <p>Helius RPC is used for live wallet reads; the paper wallet itself stays local.</p>
            </article>
            <article className="info-card">
              <p className="info-eyebrow">Latest action</p>
              <h4>{latestAction ? latestAction.kind : "idle"}</h4>
              <p>{latestAction ? latestAction.title : "No staged action yet."}</p>
            </article>
          </div>
        </section>

        <section className="surface-card paper-card paper-card-wide">
          <div className="surface-card-header">
            <h4>Private payment primitive</h4>
            <span className="surface-badge surface-badge-warm">x402 / AP2 / M2M</span>
          </div>
          <p className="mini-copy">
            Durable private payment staging for Solana with an EVM proof layer option. This is the
            wallet-side primitive the user asked for: the rail is explicit, the settlement chain is
            explicit, and the proof anchor is explicit.
          </p>
          <div className="field-grid">
            <div className="field">
              <label htmlFor="payment-rail">Rail</label>
              <select
                id="payment-rail"
                value={paymentRail}
                onChange={(event) => setPaymentRail(event.target.value as PrivatePaymentRail)}
              >
                {PAYMENT_RAILS.map((rail) => (
                  <option key={rail.value} value={rail.value}>
                    {rail.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="payment-settlement">Settlement</label>
              <select
                id="payment-settlement"
                value={settlement}
                onChange={(event) =>
                  setSettlement(event.target.value as PrivatePaymentSettlement)
                }
              >
                {SETTLEMENTS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field-grid">
            <div className="field">
              <label htmlFor="payment-proof">Proof layer</label>
              <select
                id="payment-proof"
                value={proofLayer}
                onChange={(event) => setProofLayer(event.target.value as ProofLayer)}
              >
                {PROOF_LAYERS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="payment-amount">Amount (SOL)</label>
              <input
                id="payment-amount"
                type="number"
                min="0.001"
                step="0.01"
                value={paymentAmount}
                onChange={(event) => setPaymentAmount(event.target.value)}
              />
            </div>
          </div>
          <div className="field-grid">
            <div className="field">
              <label htmlFor="payment-recipient">Recipient</label>
              <input
                id="payment-recipient"
                value={paymentRecipient}
                onChange={(event) => setPaymentRecipient(event.target.value)}
                placeholder={walletAddress ?? "private-counterparty"}
              />
            </div>
            <div className="field">
              <label htmlFor="payment-memo">Memo</label>
              <input
                id="payment-memo"
                value={paymentMemo}
                onChange={(event) => setPaymentMemo(event.target.value)}
                placeholder="Encrypted settlement memo"
              />
            </div>
          </div>
          <div className="field-grid">
            <label className="toggle-card" htmlFor="payment-durable">
              <input
                id="payment-durable"
                type="checkbox"
                checked={durable}
                onChange={(event) => setDurable(event.target.checked)}
              />
              <span>
                <strong>Durable receipt</strong>
                <small>Keep the payment primitive non-ephemeral.</small>
              </span>
            </label>
            <div className="info-card">
              <p className="info-eyebrow">Routing hint</p>
              <h4>{paymentRail.toUpperCase()} • {settlement.toUpperCase()}</h4>
              <p>{PAYMENT_RAILS.find((rail) => rail.value === paymentRail)?.note}</p>
            </div>
          </div>
          <div className="surface-actions">
            <button className="primary-button" onClick={handleStagePayment}>
              Stage private payment
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
