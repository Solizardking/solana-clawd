import { useEffect, useMemo, useState } from "react"

const BASE = "/library"
const INDEX_URL = `${BASE}/index.json`

type Agent = {
  identifier: string
  title: string
  description: string
  avatar: string
  category: string
  author: string
  createdAt?: string
  tags: string[]
  knowledgeCount: number
  tokenUsage?: number
  schemaVersion: number
  deploy: { json: string; homepage: string }
}

type Index = {
  homepage: string
  baseUrl: string
  generatedAt: string
  stats: {
    totalAgents: number
    byCategory: Record<string, number>
    totalTags: number
    totalKnowledge: number
  }
  categories: { id: string; label: string; count: number }[]
  tags: string[]
  agents: Agent[]
}

const COLORS = {
  bg: "#0b1020",
  panel: "#0f172a",
  border: "#1e293b",
  text: "#e6eaf2",
  muted: "#94a3b8",
  accent: "#38bdf8",
  violet: "#a78bfa",
  rose: "#fb7185",
  amber: "#fbbf24",
  emerald: "#34d399",
}

const CATEGORY_ICONS: Record<string, string> = {
  trading: "📈",
  defi: "💰",
  "ml-prediction": "🤖",
  payments: "💸",
  "risk-management": "🛡️",
  "deep-research": "🔎",
  "technical-analysis": "📊",
  infrastructure: "🏗️",
  strategies: "🎯",
  macro: "🌍",
  agentic: "🧬",
  nft: "🎨",
  research: "🔬",
  analytics: "📉",
  security: "🔐",
  education: "📚",
  governance: "🗳️",
  "dev-tools": "🛠️",
  uncategorized: "📦",
}

function pickIcon(cat: string): string {
  return CATEGORY_ICONS[cat] || CATEGORY_ICONS.uncategorized
}

export default function LibraryApp() {
  const [data, setData] = useState<Index | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [cat, setCat] = useState<string>("all")

  useEffect(() => {
    let alive = true
    fetch(INDEX_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} loading ${INDEX_URL}`)
        return r.json()
      })
      .then((j) => alive && setData(j))
      .catch((e) => alive && setErr(String(e)))
    return () => { alive = false }
  }, [])

  const filtered = useMemo(() => {
    if (!data) return []
    const term = q.trim().toLowerCase()
    return data.agents.filter((a) => {
      if (cat !== "all" && a.category !== cat) return false
      if (!term) return true
      const hay = `${a.title} ${a.identifier} ${a.description} ${(a.tags || []).join(" ")}`.toLowerCase()
      return hay.includes(term)
    })
  }, [data, q, cat])

  if (err) {
    return (
      <main style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, padding: 48, fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif" }}>
        <h1 style={{ color: COLORS.rose }}>🦞 Library load failed</h1>
        <pre style={{ color: COLORS.muted }}>{err}</pre>
        <p style={{ color: COLORS.muted }}>
          Make sure the catalog is built: <code style={{ color: COLORS.accent }}>npm run library:build</code>
        </p>
      </main>
    )
  }

  if (!data) {
    return (
      <main style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, padding: 48, fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif" }}>
        <p style={{ color: COLORS.muted }}>Loading library…</p>
      </main>
    )
  }

  return (
    <main style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif" }}>
      <style>{`
        .lib-card { transition: border-color 0.15s ease, transform 0.15s ease; }
        .lib-card:hover { border-color: ${COLORS.accent} !important; transform: translateY(-2px); }
        .lib-chip { transition: background 0.15s ease; }
        .lib-chip:hover { background: ${COLORS.panel}; }
        .lib-search:focus { outline: 2px solid ${COLORS.accent}; outline-offset: 1px; }
      `}</style>

      <header style={{ borderBottom: `1px solid ${COLORS.border}`, background: "rgba(11,16,32,0.85)", backdropFilter: "blur(8px)", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <a href="https://x402.wtf" style={{ color: COLORS.muted, fontSize: 12, textDecoration: "none", letterSpacing: "0.08em", textTransform: "uppercase" }}>x402.wtf</a>
            <h1 style={{ margin: "4px 0 0", fontSize: 28, fontWeight: 700 }}>
              🦞 <span style={{ background: `linear-gradient(90deg, ${COLORS.accent}, ${COLORS.violet})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Lobster Library</span>
            </h1>
          </div>
          <nav style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <a href={`${BASE}/index.json`} style={{ color: COLORS.muted, fontSize: 13, textDecoration: "none" }}>JSON</a>
            <a href={`${BASE}/schema/speraxAgentSchema_v1.json`} style={{ color: COLORS.muted, fontSize: 13, textDecoration: "none" }}>Schema</a>
            <a href="https://github.com/Solizardking/solana-clawd/tree/main/library" target="_blank" rel="noreferrer" style={{ color: COLORS.muted, fontSize: 13, textDecoration: "none" }}>GitHub</a>
          </nav>
        </div>

        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          <Stat label="agents" value={data.stats.totalAgents} color={COLORS.accent} />
          <Stat label="categories" value={data.categories.length} color={COLORS.violet} />
          <Stat label="tags" value={data.stats.totalTags} color={COLORS.amber} />
          <Stat label="knowledge" value={data.stats.totalKnowledge} color={COLORS.emerald} />
        </div>

        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px 20px", display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            className="lib-search"
            type="text"
            placeholder="Search agents, tags, descriptions…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ flex: "1 1 280px", minWidth: 240, padding: "10px 14px", background: COLORS.panel, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 10, fontSize: 14 }}
          />
          <select
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            style={{ padding: "10px 14px", background: COLORS.panel, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 10, fontSize: 14 }}
          >
            <option value="all">All categories ({data.agents.length})</option>
            {data.categories.map((c) => (
              <option key={c.id} value={c.id}>{pickIcon(c.id)} {c.label} ({c.count})</option>
            ))}
          </select>
        </div>
      </header>

      <section style={{ maxWidth: 1240, margin: "0 auto", padding: "24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
          {filtered.map((a) => (
            <article
              key={a.identifier}
              className="lib-card"
              style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 18, display: "flex", flexDirection: "column", gap: 8 }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <span style={{ fontSize: 28, lineHeight: 1 }}>{a.avatar}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: COLORS.text }}>{a.title}</h3>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: COLORS.muted, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{a.identifier}</p>
                </div>
                <span style={{ fontSize: 11, color: COLORS.muted, padding: "3px 8px", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 999, whiteSpace: "nowrap" }}>{pickIcon(a.category)} {a.category}</span>
              </div>

              <p style={{ margin: 0, fontSize: 13, color: COLORS.muted, lineHeight: 1.5 }}>{a.description}</p>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {a.tags.slice(0, 6).map((t) => (
                  <span key={t} className="lib-chip" style={{ fontSize: 11, padding: "3px 8px", borderRadius: 999, background: COLORS.bg, color: COLORS.muted, border: `1px solid ${COLORS.border}` }}>#{t}</span>
                ))}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 6, fontSize: 12 }}>
                <a href={a.deploy.json} target="_blank" rel="noreferrer" style={{ color: COLORS.accent, textDecoration: "none" }}>JSON</a>
                <span style={{ color: COLORS.border }}>·</span>
                <a href={`${BASE}/${a.identifier}.json`} target="_blank" rel="noreferrer" style={{ color: COLORS.violet, textDecoration: "none" }}>raw</a>
                {a.createdAt && (<>
                  <span style={{ color: COLORS.border }}>·</span>
                  <span style={{ color: COLORS.muted }}>{a.createdAt}</span>
                </>)}
              </div>
            </article>
          ))}
        </div>

        {filtered.length === 0 && (
          <p style={{ color: COLORS.muted, padding: 24, textAlign: "center" }}>No agents match your search.</p>
        )}
      </section>

      <footer style={{ maxWidth: 1240, margin: "0 auto", padding: "32px 24px 64px", color: COLORS.muted, fontSize: 12, borderTop: `1px solid ${COLORS.border}` }}>
        <p>
          Generated {new Date(data.generatedAt).toLocaleString()} · {data.agents.length} agents indexed · served by{" "}
          <a href="https://x402.wtf" style={{ color: COLORS.accent }}>x402.wtf</a> ·{" "}
          <a href="https://github.com/x402agent/LobsterLibrary" style={{ color: COLORS.accent }}>x402agent</a> ·{" "}
          $CLAWD: 8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump
        </p>
      </footer>
    </main>
  )
}

function Stat({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "12px 14px" }}>
      <b style={{ display: "block", fontSize: 22, color }}>{value}</b>
      <span style={{ color: COLORS.muted, fontSize: 12 }}>{label}</span>
    </div>
  )
}
