import "./index.css"
import { useEffect, useState } from "react"
import LibraryApp from "./LibraryApp.js"

function usePath() {
  const [path, setPath] = useState(() => typeof window !== "undefined" ? window.location.pathname : "/")
  useEffect(() => {
    const onChange = () => setPath(window.location.pathname)
    window.addEventListener("popstate", onChange)
    window.addEventListener("pushstate", onChange as EventListener)
    return () => {
      window.removeEventListener("popstate", onChange)
      window.removeEventListener("pushstate", onChange as EventListener)
    }
  }, [])
  return path
}

const HERO_COMMANDS = [
  "clawd openrouter setup-free --api-key sk-or-v1-...",
  "clawd preview repo",
  'clawd agent mint-devnet --name "My Devnet Agent" --description "Clawd-born operator"',
]

const SURFACES = [
  {
    title: "Lobster Library",
    eyebrow: "x402.wtf/library",
    body:
      "Browse 80+ nano Solana agents — trading, DeFi, ML prediction, x402 payment, and OpenClawd orchestration. Hosted at x402.wtf/library with a JSON catalog and an interactive React UI.",
    lines: [
      "GET /library/index.json  ·  JSON catalog",
      "GET /library/<agent>.json  ·  individual agent",
      "GET /library/schema/speraxAgentSchema_v1.json",
    ],
  },
  {
    title: "Injected API",
    eyebrow: "OpenRouter",
    body:
      "Bake in OPENROUTER_API_KEY once, preload free models, and let new users start in the terminal without hunting through JSON or env files.",
    lines: [
      "OPENROUTER_API_KEY → ~/.clawd/user-settings.json",
      "free models preloaded into /models",
      "works with direct OpenRouter or ClawdRouter-compatible base URLs",
    ],
  },
  {
    title: "Live Repo Preview",
    eyebrow: "GitHub",
    body:
      "Give people a fast taste of the project before they read 2,000 lines of docs: branch, status, recent commits, runnable scripts, and README preview.",
    lines: [
      "reads current checkout",
      "shows origin remote and branch",
      "ideal for demos, streams, and operator onboarding",
    ],
  },
  {
    title: "Mint On Devnet",
    eyebrow: "Solana",
    body:
      "Turn the terminal into a spawn point for test agents. Mint, register, and index an AI agent on solana-devnet from the same CLI people already use.",
    lines: [
      "devnet-first path",
      "inline fallback metadata",
      "local registry index updated after mint",
    ],
  },
]

const API_FLOW = [
  {
    label: "1. Browse the library",
    snippet: "curl https://x402.wtf/library/index.json | jq '.agents | length'",
  },
  {
    label: "2. Pull a single agent",
    snippet: "curl https://x402.wtf/library/solana-clawd-payment-gateway.json",
  },
  {
    label: "3. Spawn a test agent",
    snippet:
      'clawd agent mint-devnet --name "Clawd Scout" --description "Devnet preview agent"',
  },
]

const LINKS = [
  { label: "GitHub", url: "https://github.com/Solizardking/solana-clawd" },
  { label: "Library", url: "https://x402.wtf/library/" },
  { label: "ClawdRouter", url: "https://clawdrouter.fly.dev/health" },
  { label: "x402.wtf", url: "https://x402.wtf" },
  { label: "Agent Hub", url: "https://solanaclawd.com/agents" },
]

function CopyButton({ text }: { text: string }) {
  const copy = () => navigator.clipboard.writeText(text).catch(() => {})
  return (
    <button className="copyButton" onClick={copy}>
      copy
    </button>
  )
}

function CommandRow({ text }: { text: string }) {
  return (
    <div className="commandRow">
      <span className="prompt">$</span>
      <code>{text}</code>
      <CopyButton text={text} />
    </div>
  )
}

export default function App() {
  const path = usePath()
  // When deployed, /library/ is served as a static HTML page by Vite, so the
  // React router fallback only fires during local dev (where Vite serves
  // /library/*.json but the static /library/index.html isn't loaded).
  // We support both: a clean URL → no-JS static page, or a hash route → React.
  if (path === "/library" || path === "/library/") {
    return <LibraryApp />
  }

  return (
    <main className="pageShell">
      <div className="bgGlow bgGlowA" />
      <div className="bgGlow bgGlowB" />

      <section className="hero">
        <div className="heroCopy">
          <p className="eyebrow">Clawd Experience Layer</p>
          <h1>
            Give users a <span>cool Clawd surface</span> for the injected API,
            live repo previews, and devnet agent minting.
          </h1>
          <p className="lede">
            The terminal is already powerful. This page turns that power into a
            recognizable entry point people can understand in one minute.
          </p>

          <div className="heroActions">
            <a className="primaryLink" href="https://github.com/Solizardking/solana-clawd" target="_blank" rel="noreferrer">
              View GitHub
            </a>
            <a className="ghostLink" href="https://x402.wtf/library/" target="_blank" rel="noreferrer">
              🦞 Browse Library
            </a>
          </div>
        </div>

        <div className="heroTerminal">
          <div className="terminalHeader">
            <span />
            <span />
            <span />
            <p>clawd://operator-preview</p>
          </div>
          {HERO_COMMANDS.map((cmd) => (
            <CommandRow key={cmd} text={cmd} />
          ))}
          <div className="terminalNote">
            <p>Result:</p>
            <ul>
              <li>Lobster Library now serves at <code>x402.wtf/library</code></li>
              <li>OpenRouter free models are available immediately</li>
              <li>the repo becomes demoable from the CLI</li>
              <li>users can mint a real test agent on devnet</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="sectionBlock">
        <div className="sectionHeading">
          <p className="eyebrow">What This Surface Does</p>
          <h2>Four concrete product paths, not just docs.</h2>
        </div>

        <div className="cardGrid">
          {SURFACES.map((surface) => (
            <article className="featureCard" key={surface.title}>
              <p className="cardEyebrow">{surface.eyebrow}</p>
              <h3>{surface.title}</h3>
              <p>{surface.body}</p>
              <ul>
                {surface.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="sectionBlock sectionSplit">
        <div className="sectionHeading">
          <p className="eyebrow">API Flow</p>
          <h2>Exactly how a new user touches the stack.</h2>
        </div>

        <div className="flowPanel">
          {API_FLOW.map((step) => (
            <div className="flowRow" key={step.label}>
              <div>
                <p className="flowLabel">{step.label}</p>
                <code>{step.snippet}</code>
              </div>
              <CopyButton text={step.snippet} />
            </div>
          ))}
        </div>

        <div className="statusPanel">
          <p className="eyebrow">Live Endpoints</p>
          <div className="statusList">
            <a href="https://x402.wtf/library/" target="_blank" rel="noreferrer">Lobster Library</a>
            <a href="https://clawdrouter.fly.dev/health" target="_blank" rel="noreferrer">Router health</a>
            <a href="https://clawdrouter.fly.dev/v1/models" target="_blank" rel="noreferrer">Router models</a>
            <a href="https://github.com/Solizardking/solana-clawd" target="_blank" rel="noreferrer">Repo mirror</a>
            <a href="https://x402.wtf" target="_blank" rel="noreferrer">x402 control plane</a>
          </div>
        </div>
      </section>

      <section className="sectionBlock">
        <div className="sectionHeading">
          <p className="eyebrow">Link Deck</p>
          <h2>Ship this as the lightweight GitHub-facing front door.</h2>
        </div>
        <div className="linkRow">
          {LINKS.map((link) => (
            <a key={link.url} href={link.url} target="_blank" rel="noreferrer" className="linkChip">
              {link.label}
            </a>
          ))}
        </div>
      </section>
    </main>
  )
}
