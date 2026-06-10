import { useEffect, useMemo, useState } from "react";
import { DARK_AGENT_SURFACES, getDarkAgentSurface, type DarkAgentMode, createTeeAttestation } from "@dark-agent/index";
import { DARK_DEFI_SURFACES } from "@dark-defi/index";
import {
  DARK_SWAP_ROUTES,
  DARK_SWAP_TOKENS,
  estimateDarkSwap,
  type DarkSwapQuote,
  type DarkSwapToken,
} from "@dark-swap/index";
import {
  generateSaplingSpendingKey,
  deriveFullViewingKey,
  deriveIncomingViewingKey,
  createSaplingPaymentAddress,
  generateDiversifier,
} from "@dark-zcash/index";
import {
  createDemoBalance,
  connectInjectedWallet,
  createConnection,
  disconnectInjectedWallet,
  fetchTransparentBalance,
  getInjectedSolanaProvider,
  providerLabel,
  shortenAddress,
} from "./lib/wallet.js";
import {
  formatNetworkLabel,
  getDarkRuntimeConfig,
  type DarkNetwork,
  type DarkRuntimeConfig,
} from "./lib/runtime.js";
import {
  createShieldedAddress,
  formatSol,
  loadVaultState,
  saveVaultState,
  stageAgentUpdate,
  stagePrivateTransfer,
  stageShield,
  stageSwap,
  stageUnshield,
  stageZkProofGeneration,
  stageTeeAttestation,
  stageShieldedPoolDeposit,
  stagePrivacyMix,
  type DarkTransaction,
  type DarkVaultState,
} from "./lib/dark-protocol.js";
import PaperWalletSurface from "./components/wallet/PaperWalletSurface.js";

type Surface = "wallet" | "paper" | "agent" | "defi" | "swap" | "zolana";
type StatusTone = "neutral" | "success" | "warning" | "danger";

const SURFACES: Array<{
  id: Surface;
  title: string;
  subtitle: string;
}> = [
  {
    id: "wallet",
    title: "Wallet",
    subtitle: "Transparent balance, shielded staging, private transfer.",
  },
  {
    id: "paper",
    title: "Paper",
    subtitle: "Offline Solana paper wallet and cold-storage print flow.",
  },
  {
    id: "agent",
    title: "Agent",
    subtitle: "Policy, guardrails, and automation mode.",
  },
  {
    id: "defi",
    title: "DeFi",
    subtitle: "Vault, yield, and risk surfaces.",
  },
  {
    id: "swap",
    title: "Swap",
    subtitle: "Token routing and route previews.",
  },
  {
    id: "zolana",
    title: "ZOLana ⚡",
    subtitle: "ZK proofs, TEE, shielded pools, mixing, Jupiter V6.",
  },
];

const DEMO_BALANCE = createDemoBalance("dark-wallet");
const DEFAULT_DEMO_ADDRESS = "demo-dark-wallet";
const DEFAULT_SHIELD_ADDRESS = createShieldedAddress(DEFAULT_DEMO_ADDRESS, 1);

function formatTimestamp(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeInput(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function App() {
  const runtime: DarkRuntimeConfig = useMemo(() => getDarkRuntimeConfig(), []);
  const [network, setNetwork] = useState<DarkNetwork>(runtime.defaultNetwork);
  const connection = useMemo(() => createConnection(network, runtime), [network, runtime]);

  const [activeSurface, setActiveSurface] = useState<Surface>("wallet");
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(true);
  const [walletProviderName, setWalletProviderName] = useState("Demo vault");
  const [transparentBalance, setTransparentBalance] = useState(DEMO_BALANCE);
  const [networkSlot, setNetworkSlot] = useState<number | null>(null);
  const [networkStatus, setNetworkStatus] = useState("Local demo ledger ready");
  const [busy, setBusy] = useState(false);
  const [statusTone, setStatusTone] = useState<StatusTone>("neutral");
  const [statusTitle, setStatusTitle] = useState("Dark workspace ready");
  const [statusBody, setStatusBody] = useState("Launch demo mode or connect an injected Solana wallet.");
  const [vault, setVault] = useState<DarkVaultState>(() => loadVaultState(DEFAULT_DEMO_ADDRESS));
  const [shieldAmount, setShieldAmount] = useState("1.00");
  const [shieldMemo, setShieldMemo] = useState("Privacy staging");
  const [unshieldAmount, setUnshieldAmount] = useState("0.50");
  const [unshieldRecipient, setUnshieldRecipient] = useState("");
  const [transferRecipient, setTransferRecipient] = useState(DEFAULT_SHIELD_ADDRESS);
  const [transferAmount, setTransferAmount] = useState("0.25");
  const [transferMemo, setTransferMemo] = useState("");
  const [agentMode, setAgentMode] = useState<DarkAgentMode>("guardian");
  const [agentBudget, setAgentBudget] = useState("0.25");
  const [agentMemo, setAgentMemo] = useState("Screen spend paths before they leave the wallet.");
  const [swapFrom, setSwapFrom] = useState<DarkSwapToken>("SOL");
  const [swapTo, setSwapTo] = useState<DarkSwapToken>("USDC");
  const [swapAmount, setSwapAmount] = useState("0.75");
  const [swapSlippage, setSwapSlippage] = useState("35");
  const [swapQuote, setSwapQuote] = useState<DarkSwapQuote | null>(null);

  const walletKey = walletAddress ?? DEFAULT_DEMO_ADDRESS;
  const currentAgentSurface = getDarkAgentSurface(agentMode);
  const shieldedNotes = vault.notes.filter((note) => !note.spent);
  const latestAction = vault.history[0] ?? null;

  useEffect(() => {
    setVault(loadVaultState(walletKey));
  }, [walletKey]);

  useEffect(() => {
    const syncNetwork = async () => {
      if (isDemo || !walletAddress) {
        setTransparentBalance(DEMO_BALANCE);
        setNetworkSlot(null);
        setNetworkStatus(`Local demo ledger ready on ${formatNetworkLabel(network)}`);
        return;
      }

      try {
        const [balance, slot] = await Promise.all([
          fetchTransparentBalance(connection, walletAddress),
          connection.getSlot("confirmed"),
        ]);
        setTransparentBalance(balance);
        setNetworkSlot(slot);
        setNetworkStatus(
          `Synced to ${formatNetworkLabel(network)}${runtime.heliusRpcUrl || runtime.heliusApiKey ? " via Helius RPC" : ""}`,
        );
      } catch {
        setNetworkStatus(`${formatNetworkLabel(network)} RPC unavailable, keeping cached state`);
      }
    };

    void syncNetwork();
    const interval = window.setInterval(syncNetwork, 20_000);
    return () => window.clearInterval(interval);
  }, [connection, isDemo, network, runtime.heliusApiKey, runtime.heliusRpcUrl, walletAddress]);

  useEffect(() => {
    setTransferRecipient(createShieldedAddress(walletKey, 2));
  }, [walletKey]);

  useEffect(() => {
    setAgentMode(vault.agentMode);
  }, [vault.agentMode]);

  const persistVault = (next: DarkVaultState) => {
    setVault(next);
    saveVaultState(walletKey, next);
  };

  const showStatus = (tone: StatusTone, title: string, body: string) => {
    setStatusTone(tone);
    setStatusTitle(title);
    setStatusBody(body);
  };

  const startDemo = () => {
    setIsDemo(true);
    setWalletAddress(null);
    setWalletProviderName("Demo vault");
    showStatus(
      "neutral",
      "Demo vault active",
      "The wallet is running locally with a simulated private ledger.",
    );
  };

  const connectWallet = async () => {
    const provider = getInjectedSolanaProvider();
    if (!provider) {
      showStatus(
        "warning",
        "No injected wallet found",
        "Launch demo mode, or install an injected Solana wallet such as Phantom.",
      );
      return;
    }

    setBusy(true);
    try {
      const address = await connectInjectedWallet(provider);
      setWalletAddress(address);
      setWalletProviderName(providerLabel(provider));
      setIsDemo(false);
      showStatus(
        "success",
        "Wallet connected",
        `${providerLabel(provider)} is active at ${shortenAddress(address)}.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown connection error";
      showStatus("danger", "Wallet connection failed", message);
    } finally {
      setBusy(false);
    }
  };

  const disconnectWallet = async () => {
    const provider = getInjectedSolanaProvider();
    setBusy(true);
    try {
      await disconnectInjectedWallet(provider);
      startDemo();
    } finally {
      setBusy(false);
    }
  };

  const handleShield = () => {
    try {
      const amount = Number(shieldAmount);
      const next = stageShield(vault, amount, shieldMemo);
      persistVault(next.state);
      setShieldMemo("");
      showStatus(
        "success",
        "Shield staged",
        `${formatSol(amount)} is now tracked in the dark vault.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown shielding error";
      showStatus("danger", "Shielding blocked", message);
    }
  };

  const handleUnshield = () => {
    try {
      const amount = Number(unshieldAmount);
      const recipient = unshieldRecipient.trim() || walletAddress || DEFAULT_DEMO_ADDRESS;
      const next = stageUnshield(vault, amount, recipient);
      persistVault(next.state);
      setUnshieldRecipient("");
      showStatus(
        "success",
        "Unshield queued",
        `${formatSol(amount)} is staged back toward ${shortenAddress(recipient)}.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown unshield error";
      showStatus("danger", "Unshielding blocked", message);
    }
  };

  const handleTransfer = () => {
    try {
      const amount = Number(transferAmount);
      const recipient = transferRecipient.trim();
      if (!recipient.startsWith("dark1")) {
        throw new Error("Recipient must be a shielded Dark address that starts with dark1.");
      }
      const next = stagePrivateTransfer(vault, amount, recipient, transferMemo);
      persistVault(next.state);
      setTransferMemo("");
      showStatus(
        "success",
        "Private transfer staged",
        `${formatSol(amount)} is queued for ${shortenAddress(recipient)}.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown transfer error";
      showStatus("danger", "Private transfer blocked", message);
    }
  };

  const handleUpdateAgent = () => {
    try {
      const next = stageAgentUpdate(vault, agentMode, vault.routeMode, agentMemo);
      persistVault(next.state);
      showStatus(
        "success",
        "Agent policy updated",
        `${currentAgentSurface.title} is now the active guardrail mode.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown agent error";
      showStatus("danger", "Agent update blocked", message);
    }
  };

  const handleQuoteSwap = () => {
    try {
      const amount = Number(swapAmount);
      const quote = estimateDarkSwap(swapFrom, swapTo, amount, Number(swapSlippage));
      setSwapQuote(quote);
      showStatus(
        "neutral",
        "Swap quote ready",
        `${formatRelativeInput(quote.inputAmount)} ${quote.inputToken} routes to ${formatRelativeInput(quote.outputAmount)} ${quote.outputToken}.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown swap quote error";
      showStatus("danger", "Swap quote failed", message);
    }
  };

  const handleCommitSwap = () => {
    try {
      const amount = Number(swapAmount);
      const quote = swapQuote ?? estimateDarkSwap(swapFrom, swapTo, amount, Number(swapSlippage));
      const next = stageSwap(
        vault,
        quote.inputToken,
        quote.outputToken,
        quote.inputAmount,
        quote.outputAmount,
        quote.route.venue,
      );
      persistVault(next.state);
      setSwapQuote(quote);
      showStatus(
        "success",
        "Swap staged",
        `${formatRelativeInput(quote.inputAmount)} ${quote.inputToken} is routed via ${quote.route.venue}.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown swap error";
      showStatus("danger", "Swap blocked", message);
    }
  };

  const handleCopyAddress = async () => {
    if (!walletAddress) {
      return;
    }

    try {
      await navigator.clipboard.writeText(walletAddress);
      showStatus("success", "Address copied", `${shortenAddress(walletAddress)} is on the clipboard.`);
    } catch {
      showStatus("warning", "Copy unavailable", "The browser blocked clipboard access.");
    }
  };

  const currentSurfaceDetails = SURFACES.find((surface) => surface.id === activeSurface) ?? SURFACES[0];

  return (
    <main className="app-shell">
      <span className="ambient ambient-left" />
      <span className="ambient ambient-right" />

      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">D</div>
          <div>
            <p className="eyebrow">Dark workspace</p>
            <h1>Dark Wallet</h1>
            <p className="brand-subtitle">
              Private Solana wallet shell with agent, paper wallet, DeFi, and swap lanes.
            </p>
          </div>
        </div>

        <div className="status-cluster">
          <span className="pill">{isDemo ? "Demo mode" : walletProviderName}</span>
          <div className="network-toggle" role="group" aria-label="Network selector">
            <button
              className={`pill${network === "devnet" ? "" : " pill-soft"}`}
              onClick={() => setNetwork("devnet")}
            >
              Devnet
            </button>
            <button
              className={`pill${network === "mainnet-beta" ? "" : " pill-soft"}`}
              onClick={() => setNetwork("mainnet-beta")}
            >
              Mainnet
            </button>
          </div>
          <span className={`pill pill-soft${runtime.xaiApiKey ? "" : " network-muted"}`}>
            {runtime.xaiApiKey ? "xAI ready" : "xAI offline"}
          </span>
          <button className="ghost-button" onClick={handleCopyAddress} disabled={!walletAddress}>
            Copy address
          </button>
          {walletAddress ? (
            <button className="primary-button" onClick={disconnectWallet} disabled={busy}>
              Disconnect
            </button>
          ) : (
            <>
              <button className="ghost-button" onClick={startDemo} disabled={busy}>
                Launch demo
              </button>
              <button className="primary-button" onClick={connectWallet} disabled={busy}>
                Connect wallet
              </button>
            </>
          )}
        </div>
      </header>

      <section className="hero-grid">
        <article className="panel hero-panel">
          <p className="eyebrow">Private Solana cockpit</p>
          <h2>
            A clean wallet surface for real balances, simulated shielded notes, and
            module-specific routes.
          </h2>
          <p className="hero-copy">
            The original dark-wallet concept is ported into a workspace that keeps the
            UI, the routing surface, and the policy lanes in separate modules.
            Transparent balance comes from the selected Solana cluster when a wallet is connected,
            while the paper-wallet lane stays browser-local.
          </p>

          <div className="hero-actions">
            <button className="primary-button" onClick={activeSurface === "wallet" ? handleShield : startDemo}>
              {activeSurface === "wallet" ? "Stage shield" : "Reset demo state"}
            </button>
            <button className="ghost-button" onClick={() => setActiveSurface("swap")}>
              Open swap lane
            </button>
          </div>

          <div className="metrics-grid">
            <div className="metric-card">
              <span className="metric-label">Transparent</span>
              <strong>{formatSol(transparentBalance)}</strong>
              <span className="metric-note">
                {isDemo ? "Local demo balance" : `Read from ${formatNetworkLabel(network)}`}
              </span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Shielded</span>
              <strong>{formatSol(vault.shieldedBalance)}</strong>
              <span className="metric-note">Local private ledger</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Committed</span>
              <strong>{formatSol(vault.committedBalance)}</strong>
              <span className="metric-note">Staged but not executed</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Network slot</span>
              <strong>{networkSlot ?? "local"}</strong>
              <span className="metric-note">{networkStatus}</span>
            </div>
          </div>
        </article>

        <aside className="panel console-panel">
          <div className="panel-header">
            <p className="eyebrow">Command console</p>
            <span className={`tone-chip tone-${statusTone}`}>{statusTone}</span>
          </div>

          <div className="console-body">
            <div className="console-row">
              <span className="console-key">wallet</span>
              <span className="console-value">{walletAddress ? shortenAddress(walletAddress) : "demo-vault"}</span>
            </div>
            <div className="console-row">
              <span className="console-key">surface</span>
              <span className="console-value">{currentSurfaceDetails.title}</span>
            </div>
            <div className="console-row">
              <span className="console-key">vault</span>
              <span className="console-value">{formatSol(vault.shieldedBalance)} shielded</span>
            </div>
            <div className="console-row">
              <span className="console-key">agent</span>
              <span className="console-value">{currentAgentSurface.title}</span>
            </div>
            <div className="console-row">
              <span className="console-key">status</span>
              <span className="console-value">{statusTitle}</span>
            </div>
          </div>

          <div className="console-highlight">
            <strong>{statusTitle}</strong>
            <p>{statusBody}</p>
          </div>

          <div className="console-footer">
            <span>{networkStatus}</span>
            <span>{walletAddress ? shortenAddress(walletAddress) : "demo"}</span>
          </div>
        </aside>
      </section>

      <nav className="surface-tabs" aria-label="Workspace surfaces">
        {SURFACES.map((surface) => (
          <button
            key={surface.id}
            className={`surface-tab${surface.id === activeSurface ? " active" : ""}`}
            onClick={() => setActiveSurface(surface.id)}
          >
            <span>{surface.title}</span>
            <small>{surface.subtitle}</small>
          </button>
        ))}
      </nav>

      <section className="workspace-grid">
        <article className="panel surface-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Workspace</p>
              <h3>{currentSurfaceDetails.title}</h3>
              <p className="surface-copy">{currentSurfaceDetails.subtitle}</p>
            </div>
            <span className="pill pill-soft">local-first</span>
          </div>

          {activeSurface === "wallet" && (
            <div className="surface-stack">
              <div className="action-grid">
                <section className="surface-card">
                  <div className="surface-card-header">
                    <h4>Shield stage</h4>
                    <span className="surface-badge">vault</span>
                  </div>
                  <div className="field">
                    <label htmlFor="shield-amount">Amount</label>
                    <input
                      id="shield-amount"
                      type="number"
                      min="0.001"
                      step="0.01"
                      value={shieldAmount}
                      onChange={(event) => setShieldAmount(event.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="shield-memo">Memo</label>
                    <textarea
                      id="shield-memo"
                      value={shieldMemo}
                      onChange={(event) => setShieldMemo(event.target.value)}
                      placeholder="Private note for the vault"
                    />
                  </div>
                  <div className="surface-actions">
                    <button className="primary-button" onClick={handleShield}>
                      Stage shield
                    </button>
                    <button
                      className="ghost-button"
                      onClick={() => {
                        setShieldAmount("1.00");
                        setShieldMemo("Privacy staging");
                      }}
                    >
                      Reset
                    </button>
                  </div>
                </section>

                <section className="surface-card">
                  <div className="surface-card-header">
                    <h4>Unshield release</h4>
                    <span className="surface-badge surface-badge-warm">release</span>
                  </div>
                  <div className="field-grid">
                    <div className="field">
                      <label htmlFor="unshield-amount">Amount</label>
                      <input
                        id="unshield-amount"
                        type="number"
                        min="0.001"
                        step="0.01"
                        value={unshieldAmount}
                        onChange={(event) => setUnshieldAmount(event.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="unshield-recipient">Recipient</label>
                      <input
                        id="unshield-recipient"
                        type="text"
                        value={unshieldRecipient}
                        onChange={(event) => setUnshieldRecipient(event.target.value)}
                        placeholder={walletAddress ?? "transparent wallet"}
                      />
                    </div>
                  </div>
                  <div className="surface-actions">
                    <button className="primary-button" onClick={handleUnshield}>
                      Queue release
                    </button>
                    <button
                      className="ghost-button"
                      onClick={() => {
                        setUnshieldAmount("0.50");
                        setUnshieldRecipient("");
                      }}
                    >
                      Reset
                    </button>
                  </div>
                </section>

                <section className="surface-card">
                  <div className="surface-card-header">
                    <h4>Private transfer</h4>
                    <span className="surface-badge surface-badge-cool">shielded</span>
                  </div>
                  <div className="field">
                    <label htmlFor="transfer-recipient">Shielded recipient</label>
                    <input
                      id="transfer-recipient"
                      type="text"
                      value={transferRecipient}
                      onChange={(event) => setTransferRecipient(event.target.value)}
                      placeholder="dark1..."
                    />
                  </div>
                  <div className="field-grid">
                    <div className="field">
                      <label htmlFor="transfer-amount">Amount</label>
                      <input
                        id="transfer-amount"
                        type="number"
                        min="0.001"
                        step="0.01"
                        value={transferAmount}
                        onChange={(event) => setTransferAmount(event.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="transfer-memo">Memo</label>
                      <input
                        id="transfer-memo"
                        type="text"
                        value={transferMemo}
                        onChange={(event) => setTransferMemo(event.target.value)}
                        placeholder="Encrypted note"
                      />
                    </div>
                  </div>
                  <div className="surface-actions">
                    <button className="primary-button" onClick={handleTransfer}>
                      Queue private transfer
                    </button>
                    <button
                      className="ghost-button"
                      onClick={() => {
                        setTransferRecipient(createShieldedAddress(walletKey, 3));
                        setTransferAmount("0.25");
                        setTransferMemo("");
                      }}
                    >
                      Rotate address
                    </button>
                  </div>
                </section>
              </div>
            </div>
          )}

          {activeSurface === "paper" && (
            <PaperWalletSurface
              network={network}
              runtime={runtime}
              vault={vault}
              persistVault={persistVault}
              onStatus={showStatus}
              walletAddress={walletAddress}
            />
          )}

          {activeSurface === "agent" && (
            <div className="surface-stack">
              <div className="surface-card">
                <div className="surface-card-header">
                  <h4>Agent policy</h4>
                  <span className="surface-badge surface-badge-warm">guardrail</span>
                </div>
                <div className="field-grid">
                  <div className="field">
                    <label htmlFor="agent-mode">Mode</label>
                    <select
                      id="agent-mode"
                      value={agentMode}
                      onChange={(event) => setAgentMode(event.target.value as DarkAgentMode)}
                    >
                      {DARK_AGENT_SURFACES.map((surface) => (
                        <option key={surface.id} value={surface.id}>
                          {surface.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="agent-budget">Spend budget (SOL)</label>
                    <input
                      id="agent-budget"
                      type="number"
                      min="0"
                      step="0.05"
                      value={agentBudget}
                      onChange={(event) => setAgentBudget(event.target.value)}
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="agent-memo">Instruction</label>
                  <textarea
                    id="agent-memo"
                    value={agentMemo}
                    onChange={(event) => setAgentMemo(event.target.value)}
                    placeholder="Describe the policy guardrails or automation goal."
                  />
                </div>
                <div className="surface-actions">
                  <button className="primary-button" onClick={handleUpdateAgent}>
                    Update policy
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => {
                      setAgentMode("guardian");
                      setAgentBudget("0.25");
                      setAgentMemo("Screen spend paths before they leave the wallet.");
                    }}
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div className="info-grid">
                {DARK_AGENT_SURFACES.map((surface) => (
                  <article className="info-card" key={surface.id}>
                    <p className="info-eyebrow">{surface.id}</p>
                    <h4>{surface.title}</h4>
                    <p>{surface.subtitle}</p>
                    <ul>
                      {surface.bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </div>
          )}

          {activeSurface === "defi" && (
            <div className="surface-stack">
              <div className="info-grid">
                {DARK_DEFI_SURFACES.map((surface) => (
                  <article className="info-card" key={surface.id}>
                    <p className="info-eyebrow">{surface.id}</p>
                    <h4>{surface.title}</h4>
                    <p>{surface.subtitle}</p>
                    <ul>
                      {surface.bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>

              <div className="surface-card">
                <div className="surface-card-header">
                  <h4>Private vault summary</h4>
                  <span className="surface-badge">state</span>
                </div>
                <div className="metric-inline-grid">
                  <div>
                    <span className="metric-label">Notes</span>
                    <strong>{shieldedNotes.length}</strong>
                  </div>
                  <div>
                    <span className="metric-label">Committed</span>
                    <strong>{formatSol(vault.committedBalance)}</strong>
                  </div>
                  <div>
                    <span className="metric-label">Mode</span>
                    <strong>{vault.routeMode}</strong>
                  </div>
                </div>
                <p className="mini-copy">
                  Dark DeFi stays intentionally conservative until a deeper protocol surface is
                  plugged in.
                </p>
              </div>
            </div>
          )}

          {activeSurface === "swap" && (
            <div className="surface-stack">
              <div className="surface-card">
                <div className="surface-card-header">
                  <h4>Swap quote</h4>
                  <span className="surface-badge surface-badge-cool">route</span>
                </div>
                <div className="field-grid">
                  <div className="field">
                    <label htmlFor="swap-from">From</label>
                    <select
                      id="swap-from"
                      value={swapFrom}
                      onChange={(event) => setSwapFrom(event.target.value as DarkSwapToken)}
                    >
                      {Object.keys(DARK_SWAP_TOKENS).map((token) => (
                        <option key={token} value={token}>
                          {token}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="swap-to">To</label>
                    <select
                      id="swap-to"
                      value={swapTo}
                      onChange={(event) => setSwapTo(event.target.value as DarkSwapToken)}
                    >
                      {Object.keys(DARK_SWAP_TOKENS).map((token) => (
                        <option key={token} value={token}>
                          {token}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="field-grid">
                  <div className="field">
                    <label htmlFor="swap-amount">Amount</label>
                    <input
                      id="swap-amount"
                      type="number"
                      min="0.001"
                      step="0.01"
                      value={swapAmount}
                      onChange={(event) => setSwapAmount(event.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="swap-slippage">Max slippage (bps)</label>
                    <input
                      id="swap-slippage"
                      type="number"
                      min="1"
                      step="1"
                      value={swapSlippage}
                      onChange={(event) => setSwapSlippage(event.target.value)}
                    />
                  </div>
                </div>
                <div className="surface-actions">
                  <button className="primary-button" onClick={handleQuoteSwap}>
                    Preview route
                  </button>
                  <button className="primary-button" onClick={handleCommitSwap}>
                    Stage swap
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => {
                      setSwapFrom("SOL");
                      setSwapTo("USDC");
                      setSwapAmount("0.75");
                      setSwapSlippage("35");
                      setSwapQuote(null);
                    }}
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div className="surface-card surface-card-dark">
                <div className="surface-card-header">
                  <h4>Route preview</h4>
                  <span className="surface-badge surface-badge-warm">estimator</span>
                </div>
                {swapQuote ? (
                  <div className="quote-card">
                    <div className="quote-row">
                      <span>Input</span>
                      <strong>
                        {formatRelativeInput(swapQuote.inputAmount)} {swapQuote.inputToken}
                      </strong>
                    </div>
                    <div className="quote-row">
                      <span>Output</span>
                      <strong>
                        {formatRelativeInput(swapQuote.outputAmount)} {swapQuote.outputToken}
                      </strong>
                    </div>
                    <div className="quote-row">
                      <span>Route</span>
                      <strong>{swapQuote.route.venue}</strong>
                    </div>
                    <div className="quote-row">
                      <span>Slippage</span>
                      <strong>{swapQuote.slippageBps} bps</strong>
                    </div>
                  </div>
                ) : (
                  <p className="mini-copy">
                    Run a preview to compute a static route estimate. The wallet keeps the route
                    decision visible so the user can confirm the path before it is staged.
                  </p>
                )}

                <div className="info-grid compact">
                  {DARK_SWAP_ROUTES.map((route) => (
                    <article className="info-card" key={route.venue}>
                      <p className="info-eyebrow">{route.speed}</p>
                      <h4>{route.venue}</h4>
                      <p>{route.label}</p>
                      <ul>
                        <li>{route.note}</li>
                        <li>{route.slippageBps} bps floor</li>
                      </ul>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeSurface === "zolana" && (
            <div className="surface-stack">
              <div className="info-grid">
                <div className="surface-card">
                  <div className="surface-card-header">
                    <h4>🔐 ZK Prover</h4>
                    <span className="surface-badge surface-badge-cool">Groth16</span>
                  </div>
                  <p className="mini-copy">
                    Generate zero-knowledge proofs for shielded transfers using 256-byte Groth16 proofs.
                    Hides amounts, sender, and recipient on-chain.
                  </p>
                  <div className="metric-inline-grid">
                    <div>
                      <span className="metric-label">Proofs generated</span>
                      <strong>{vault.zkProofsGenerated}</strong>
                    </div>
                    <div>
                      <span className="metric-label">Proof size</span>
                      <strong>256 bytes</strong>
                    </div>
                    <div>
                      <span className="metric-label">Circuit</span>
                      <strong>shielded-transfer-v1</strong>
                    </div>
                  </div>
                  <div className="surface-actions">
                    <button className="primary-button" onClick={() => {
                      try {
                        const next = stageZkProofGeneration(vault, 0.5, vault.notes[0]?.recipient ?? "zsol1...");
                        persistVault(next.state);
                        showStatus("success", "ZK proof generated", "Groth16 proof ready for shielded transfer.");
                      } catch (error) {
                        const message = error instanceof Error ? error.message : "ZK proof error";
                        showStatus("danger", "ZK proof failed", message);
                      }
                    }}>
                      Generate ZK proof
                    </button>
                  </div>
                </div>

                <div className="surface-card">
                  <div className="surface-card-header">
                    <h4>🛡️ TEE Attestation</h4>
                    <span className="surface-badge surface-badge-warm">SGX/SEV</span>
                  </div>
                  <p className="mini-copy">
                    Create hardware-level attestations using Intel SGX or AMD SEV trusted execution
                    environments. Agents run in encrypted memory enclaves.
                  </p>
                  <div className="metric-inline-grid">
                    <div>
                      <span className="metric-label">Attestations</span>
                      <strong>{vault.teeAttestations}</strong>
                    </div>
                    <div>
                      <span className="metric-label">Providers</span>
                      <strong>Intel SGX / AMD SEV</strong>
                    </div>
                  </div>
                  <div className="surface-actions">
                    <button className="primary-button" onClick={() => {
                      try {
                        const attestation = createTeeAttestation("intel_sgx", "Dark wallet session");
                        const next = stageTeeAttestation(vault, "intel_sgx", "TEE attestation created");
                        persistVault(next.state);
                        showStatus("success", "TEE attestation created", `SGX measurement: ${attestation.measurement.slice(0, 16)}...`);
                      } catch (error) {
                        const message = error instanceof Error ? error.message : "TEE error";
                        showStatus("danger", "TEE attestation failed", message);
                      }
                    }}>
                      Create TEE attestation
                    </button>
                  </div>
                </div>

                <div className="surface-card">
                  <div className="surface-card-header">
                    <h4>🏊 Shielded Pool</h4>
                    <span className="surface-badge surface-badge-cool">privacy</span>
                  </div>
                  <p className="mini-copy">
                    Zcash-style privacy pool with Merkle tree commitments. Deposit tokens and withdraw
                    with ZK proof verification.
                  </p>
                  <div className="metric-inline-grid">
                    <div>
                      <span className="metric-label">Pool deposits</span>
                      <strong>{vault.privacyPoolDeposits}</strong>
                    </div>
                    <div>
                      <span className="metric-label">Merkle root</span>
                      <strong>{vault.privacyPoolDeposits > 0 ? "0x" + "•".repeat(6) : "empty"}</strong>
                    </div>
                  </div>
                  <div className="surface-actions">
                    <button className="primary-button" onClick={() => {
                      try {
                        const next = stageShieldedPoolDeposit(vault, 0.25);
                        persistVault(next.state);
                        showStatus("success", "Pool deposit staged", "Commitment added to shielded pool Merkle tree.");
                      } catch (error) {
                        const message = error instanceof Error ? error.message : "Pool error";
                        showStatus("danger", "Pool deposit failed", message);
                      }
                    }}>
                      Deposit to pool
                    </button>
                  </div>
                </div>

                <div className="surface-card">
                  <div className="surface-card-header">
                    <h4>🌀 Privacy Mix</h4>
                    <span className="surface-badge surface-badge-warm">anonymity</span>
                  </div>
                  <p className="mini-copy">
                    Multi-hop mixing for enhanced transaction graph obfuscation. Configurable mix depth
                    of 2, 4, or 8 hops with delayed withdrawals.
                  </p>
                  <div className="metric-inline-grid">
                    <div>
                      <span className="metric-label">Mix depth</span>
                      <strong>{vault.privacyMixDepth} hops</strong>
                    </div>
                    <div>
                      <span className="metric-label">Relayer fee</span>
                      <strong>0.1%</strong>
                    </div>
                  </div>
                  <div className="surface-actions">
                    <button className="primary-button" onClick={() => {
                      try {
                        const next = stagePrivacyMix(vault, 0.1, vault.privacyMixDepth);
                        persistVault(next.state);
                        showStatus("success", "Privacy mix queued", `${0.1} SOL mixed through ${vault.privacyMixDepth} hops.`);
                      } catch (error) {
                        const message = error instanceof Error ? error.message : "Mix error";
                        showStatus("danger", "Privacy mix failed", message);
                      }
                    }}>
                      Mix tokens
                    </button>
                  </div>
                </div>

                <div className="surface-card">
                  <div className="surface-card-header">
                    <h4>🔄 Jupiter V6 Quotes</h4>
                    <span className="surface-badge surface-badge-cool">live</span>
                  </div>
                  <p className="mini-copy">
                    Fetch real swap quotes from Jupiter V6 quote API. Supports 10 tokens including
                    SOL, USDC, USDT, JUP, mSOL, BONK, PYTH, JLP, ETH (Wormhole), and BTC (Wormhole).
                  </p>
                  <div className="metric-inline-grid">
                    <div>
                      <span className="metric-label">Token pairs</span>
                      <strong>10 tokens</strong>
                    </div>
                    <div>
                      <span className="metric-label">API</span>
                      <strong>quote-api.jup.ag/v6</strong>
                    </div>
                    <div>
                      <span className="metric-label">Routes</span>
                      <strong>5 venues</strong>
                    </div>
                  </div>
                  <button className="ghost-button" onClick={() => setActiveSurface("swap")}>
                    Open swap lane →
                  </button>
                </div>
              </div>

              <div className="surface-card surface-card-dark">
                <div className="surface-card-header">
                  <h4>💰 JLP Perpetuals</h4>
                  <span className="surface-badge surface-badge-warm">leveraged</span>
                </div>
                <p className="mini-copy">
                  Jupiter LP Perpetuals — long/short positions with leverage via the JLP pool.
                  Supports 5 custody tokens: SOL, ETH, BTC, USDC, USDT.
                </p>
                <div className="metric-inline-grid">
                  <div>
                    <span className="metric-label">JLP Pool</span>
                    <strong>$500M AUM</strong>
                  </div>
                  <div>
                    <span className="metric-label">LP price</span>
                    <strong>$1.85</strong>
                  </div>
                  <div>
                    <span className="metric-label">Custody tokens</span>
                    <strong>5</strong>
                  </div>
                </div>
                <div className="surface-actions">
                  <button className="primary-button" onClick={() => {
                    showStatus("neutral", "JLP Perpetuals ready", "Pool: $500M AUM | LP price: $1.85 | Custody: SOL, ETH, BTC, USDC, USDT");
                  }}>
                    Check pool state
                  </button>
                </div>
              </div>

              <div className="surface-card surface-card-dark">
                <div className="surface-card-header">
                  <h4>🛡️ Zcash Sapling</h4>
                  <span className="surface-badge">zk-SNARKs</span>
                </div>
                <p className="mini-copy">
                  Full Zcash Sapling address derivation chain: spending key → full viewing key →
                  incoming viewing key → 43-byte shielded address. Ready for private transactions.
                </p>
                <div className="metric-inline-grid">
                  <div>
                    <span className="metric-label">Key size</span>
                    <strong>32 bytes</strong>
                  </div>
                  <div>
                    <span className="metric-label">Address format</span>
                    <strong>zsol1...</strong>
                  </div>
                  <div>
                    <span className="metric-label">Proof system</span>
                    <strong>Groth16</strong>
                  </div>
                </div>
                <div className="surface-actions">
                  <button className="ghost-button" onClick={() => {
                    const sk = generateSaplingSpendingKey();
                    const fvk = deriveFullViewingKey(sk);
                    const ivk = deriveIncomingViewingKey(fvk);
                    const d = generateDiversifier();
                    const addr = createSaplingPaymentAddress(ivk, d);
                    showStatus("success", "Sapling key generated", `Shielded address: zsol1${Array.from(addr.pk_d.slice(0, 8)).map(b => b.toString(16).padStart(2, "0")).join("")}...`);
                  }}>
                    Generate Sapling key
                  </button>
                </div>
              </div>

              <div className="surface-card">
                <div className="surface-card-header">
                  <h4>📡 Helius RPC</h4>
                  <span className="surface-badge surface-badge-cool">infra</span>
                </div>
                <p className="mini-copy">
                  Enterprise Solana infrastructure with smart RPC, webhooks, DAS NFT API, and
                  priority fee estimation.
                </p>
                <div className="metric-inline-grid">
                  <div>
                    <span className="metric-label">Smart TX</span>
                    <strong>Auto CU + fees</strong>
                  </div>
                  <div>
                    <span className="metric-label">Webhooks</span>
                    <strong>Real-time</strong>
                  </div>
                  <div>
                    <span className="metric-label">DAS API</span>
                    <strong>NFT metadata</strong>
                  </div>
                </div>
                <div className="surface-actions">
                  <button className="ghost-button" onClick={() => {
                    showStatus("neutral", "Helius RPC ready", "Smart transactions, DAS API, webhooks, and priority fees available.");
                  }}>
                    Check infra status
                  </button>
                </div>
              </div>
            </div>
          )}
        </article>

        <aside className="panel sidebar-panel">
          <div className="surface-card surface-card-dark">
            <div className="surface-card-header">
              <h4>Latest action</h4>
              <span className="surface-badge">{latestAction ? latestAction.status : "idle"}</span>
            </div>
            {latestAction ? (
              <div className="quote-card">
                <div className="quote-row">
                  <span>Type</span>
                  <strong>{latestAction.kind}</strong>
                </div>
                <div className="quote-row">
                  <span>Detail</span>
                  <strong>{latestAction.title}</strong>
                </div>
                <div className="quote-row">
                  <span>Time</span>
                  <strong>{formatTimestamp(latestAction.createdAt)}</strong>
                </div>
              </div>
            ) : (
              <p className="mini-copy">No actions yet. Start with shield staging or a route preview.</p>
            )}
          </div>

          <div className="surface-card">
            <div className="surface-card-header">
              <h4>Activity feed</h4>
              <span className="surface-badge surface-badge-cool">{vault.history.length}</span>
            </div>
            <div className="activity-list">
              {vault.history.length > 0 ? (
                vault.history.slice(0, 6).map((entry: DarkTransaction) => (
                  <article className="activity-item" key={entry.id}>
                    <div className="activity-top">
                      <p className="activity-title">{entry.title}</p>
                      <span className={`mini-status mini-${entry.status}`}>{entry.status}</span>
                    </div>
                    <p className="activity-copy">
                      {entry.detail}
                    </p>
                    <div className="activity-meta">
                      <span>{formatTimestamp(entry.createdAt)}</span>
                      <span>{entry.signature}</span>
                    </div>
                  </article>
                ))
              ) : (
                <p className="mini-copy">The feed is empty until the first staged action.</p>
              )}
            </div>
          </div>

          <div className="surface-card">
            <div className="surface-card-header">
              <h4>Module map</h4>
              <span className="surface-badge surface-badge-warm">workspace</span>
            </div>
            <div className="module-list">
              <article className="module-card">
                <p className="info-eyebrow">dark-agent</p>
                <h5>Policy and automation lane</h5>
                <p>Guardrails for spend, route, and memo decisions.</p>
              </article>
              <article className="module-card">
                <p className="info-eyebrow">dark-paper</p>
                <h5>Paper wallet lane</h5>
                <p>Offline Solana key generation, print flow, and cold storage export.</p>
              </article>
              <article className="module-card">
                <p className="info-eyebrow">dark-defi</p>
                <h5>Vault and risk lane</h5>
                <p>Private balance staging and conservative DeFi posture.</p>
              </article>
              <article className="module-card">
                <p className="info-eyebrow">dark-swap</p>
                <h5>Routing and quote lane</h5>
                <p>Static route preview now, live routing later.</p>
              </article>
            </div>
          </div>
        </aside>
      </section>

      <footer className="footer-note">
        <span>{walletAddress ? shortenAddress(walletAddress) : "demo-vault"}</span>
        <span>{walletProviderName}</span>
        <span>{currentSurfaceDetails.title}</span>
      </footer>
    </main>
  );
}

export default App;
