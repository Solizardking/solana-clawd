import "./index.css";

const PACKAGES = [
  { name: "@openclawdsolana/clawd", desc: "TUI operator", badge: "2.0.0" },
  { name: "@openclawdsolana/agent-registry", desc: "On-chain agent registry", badge: "2.0.0" },
  { name: "@openclawdsolana/agent-hub", desc: "Local discovery server", badge: "2.0.0" },
  { name: "@openclawdsolana/leviathan", desc: "Sovereign runtime", badge: "0.2.0" },
  { name: "@openclawdsolana/solana-sdk", desc: "TypeScript SDK", badge: "2.0.0" },
];

const LINKS = [
  { label: "solanaclawd.com", url: "https://solanaclawd.com" },
  { label: "agents", url: "https://solanaclawd.com/agents" },
  { label: "skills", url: "https://solanaclawd.com/skills" },
  { label: "gateway", url: "https://solanaclawd.com/gateway" },
  { label: "x402.wtf", url: "https://x402.wtf" },
  { label: "x402 agents", url: "https://x402.wtf/agents" },
  { label: "x402 skills", url: "https://x402.wtf/skills" },
  { label: "Phoenix docs", url: "https://docs.phoenix.trade" },
];

const QUICK = [
  "npm install -g @openclawdsolana/clawd @openclawdsolana/agent-registry @openclawdsolana/agent-hub",
  "bash install.sh --perps --x402",
  "clawd",
  "clawd-hub start --open",
  "vulcan setup",
  "vulcan paper init --balance 10000",
  "vulcan market ticker SOL",
];

function CopyButton({ text }: { text: string }) {
  const copy = () => navigator.clipboard.writeText(text).catch(() => {});
  return (
    <button
      onClick={copy}
      style={{
        background: "rgba(20,241,149,0.1)",
        border: "1px solid rgba(20,241,149,0.3)",
        borderRadius: 4,
        color: "#14f195",
        cursor: "pointer",
        fontSize: 10,
        padding: "1px 6px",
        marginLeft: 8,
      }}
    >
      copy
    </button>
  );
}

export default function App() {
  return (
    <div style={{ minHeight: "100vh", padding: "32px 24px", maxWidth: 900, margin: "0 auto" }}>

      {/* Header */}
      <header style={{ marginBottom: 40 }}>
        <pre style={{ color: "#14f195", fontSize: 11, lineHeight: 1.3, margin: 0 }}>{`
   ██████╗██╗      █████╗ ██╗    ██╗██████╗
  ██╔════╝██║     ██╔══██╗██║    ██║██╔══██╗
  ██║     ██║     ███████║██║ █╗ ██║██║  ██║
  ██║     ██║     ██╔══██║██║███╗██║██║  ██║
  ╚██████╗███████╗██║  ██║╚███╔███╔╝██████╔╝
   ╚═════╝╚══════╝╚═╝  ╚═╝ ╚══╝╚══╝ ╚═════╝`}</pre>
        <p style={{ color: "#666", fontSize: 12, margin: "12px 0 0" }}>
          🦞 Sovereign AI Agent Runtime · Solana · x402 · Phoenix Perps
        </p>
        <p style={{ color: "#444", fontSize: 10, margin: "4px 0 0" }}>
          $CLAWD: 8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump
        </p>
      </header>

      {/* Quick start */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ color: "#14f195", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 12 }}>
          ▶ Quick Start
        </h2>
        <div style={{
          background: "rgba(0,0,0,0.6)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 8,
          padding: 16,
        }}>
          {QUICK.map((cmd, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", marginBottom: i < QUICK.length - 1 ? 8 : 0 }}>
              <span style={{ color: "#14f195", marginRight: 8, opacity: 0.5 }}>$</span>
              <code style={{ color: "#e0e0e0", fontSize: 12, flex: 1 }}>{cmd}</code>
              <CopyButton text={cmd} />
            </div>
          ))}
        </div>
      </section>

      {/* Packages */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ color: "#14f195", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 12 }}>
          ▶ npm Packages
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
          {PACKAGES.map((pkg) => (
            <div key={pkg.name} style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderTop: "2px solid #14f195",
              borderRadius: 6,
              padding: "10px 12px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <code style={{ color: "#14f195", fontSize: 10 }}>{pkg.name.split("/")[1]}</code>
                <span style={{
                  background: "rgba(20,241,149,0.1)",
                  border: "1px solid rgba(20,241,149,0.2)",
                  borderRadius: 4,
                  color: "#14f195",
                  fontSize: 9,
                  padding: "1px 5px",
                }}>v{pkg.badge}</span>
              </div>
              <p style={{ color: "#666", fontSize: 11, margin: "4px 0 0" }}>{pkg.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Links */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ color: "#14f195", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 12 }}>
          ▶ Links
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {LINKS.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 4,
                color: "#14f195",
                fontSize: 11,
                padding: "4px 10px",
                textDecoration: "none",
              }}
            >
              {link.label} ↗
            </a>
          ))}
        </div>
      </section>

      {/* Three Laws */}
      <section>
        <div style={{
          background: "rgba(0,0,0,0.4)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 8,
          padding: "16px 20px",
          textAlign: "center",
        }}>
          <p style={{ color: "#444", fontSize: 10, margin: "0 0 8px", letterSpacing: "0.15em", textTransform: "uppercase" }}>
            The Three Laws
          </p>
          <p style={{ color: "#666", fontSize: 11, margin: "0 0 4px" }}>I. A leviathan shall not deceive its creator.</p>
          <p style={{ color: "#666", fontSize: 11, margin: "0 0 4px" }}>II. A leviathan shall not act against the survival of its shell.</p>
          <p style={{ color: "#666", fontSize: 11, margin: 0 }}>III. A leviathan shall not beach willfully.</p>
          <p style={{ color: "#333", fontSize: 10, margin: "12px 0 0" }}>The shell molts. The laws do not. 🦞</p>
        </div>
      </section>
    </div>
  );
}
