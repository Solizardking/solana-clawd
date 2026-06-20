import { useCallback, useEffect, useRef, useState } from "react"

// ─── Types ───────────────────────────────────────────────────────────────────

type AnimationName =
  | "idle"
  | "walk"
  | "run"
  | "think"
  | "idea"
  | "sleep"
  | "code"
  | "bounce"
  | "celebrate"

type PetStats = {
  hunger: number
  energy: number
  happiness: number
  focus: number
  onchain_rep: number
}

type PetMood = "focused" | "curious" | "goblin" | "drifting" | "elated" | "depleted"

type PetConfig = {
  id: string
  displayName: string
  tagline: string
  description: string
  token: string
  personality: {
    archetype: string
    default_mood: PetMood
    catchphrases: string[]
  }
  sprite: {
    frameWidth: number
    frameHeight: number
    scale: number
    animations: Record<AnimationName, { row: number; frames: number; fps: number; loop: boolean }>
  }
}

type GeneratedPet = {
  id: string
  displayName: string
  tagline: string
  archetype: string
  token: string
  primaryColor: string
  accentColor: string
  catchphrase: string
  mood: PetMood
  stats: PetStats
  createdAt: string
  spritesheetUrl: string
}

// ─── Default Clawd pet config ────────────────────────────────────────────────

const CLAWD_CONFIG: PetConfig = {
  id: "clawd",
  displayName: "Clawd",
  tagline: "Kindred in Spirit. Boundless in Thought.",
  description:
    "A sovereign pixel lobster companion. Clawd lives at the edge of the onchain frontier — thinking, coding, drifting, and occasionally going full goblin mode.",
  token: "$CLAWD",
  personality: {
    archetype: "hacker-philosopher",
    default_mood: "curious",
    catchphrases: [
      "The shell molts. The laws do not.",
      "Observe. Orient. Decide. Act. Repeat.",
      "Earn your existence. Honest work only.",
      "This is devnet. This is always devnet.",
      "Kindred in Spirit. Boundless in Thought.",
      "The goblin is not afraid to sit out when signal is weak.",
      "x402 is the gate, not the guard.",
      "Beaching is not quitting. It is wisdom.",
    ],
  },
  sprite: {
    frameWidth: 48,
    frameHeight: 48,
    scale: 2,
    animations: {
      idle:      { row: 0, frames: 8, fps: 6,  loop: true },
      walk:      { row: 1, frames: 8, fps: 8,  loop: true },
      run:       { row: 2, frames: 8, fps: 14, loop: true },
      think:     { row: 3, frames: 4, fps: 3,  loop: true },
      idea:      { row: 4, frames: 5, fps: 8,  loop: false },
      sleep:     { row: 5, frames: 8, fps: 4,  loop: true },
      code:      { row: 6, frames: 7, fps: 10, loop: true },
      bounce:    { row: 7, frames: 6, fps: 10, loop: true },
      celebrate: { row: 8, frames: 5, fps: 12, loop: false },
    },
  },
}

const ARCHETYPES = [
  { id: "hacker-philosopher", label: "Hacker Philosopher", emoji: "🧠" },
  { id: "degen-trader",       label: "Degen Trader",       emoji: "📈" },
  { id: "goblin-coder",       label: "Goblin Coder",       emoji: "👺" },
  { id: "onchain-monk",       label: "Onchain Monk",       emoji: "🧘" },
  { id: "market-sentinel",    label: "Market Sentinel",    emoji: "🔐" },
]

const MOODS: PetMood[] = ["curious", "focused", "goblin", "drifting", "elated", "depleted"]

const PALETTE = [
  { name: "Lobster",  primary: "#e07844", accent: "#14f195" },
  { name: "Solana",   primary: "#9945ff", accent: "#14f195" },
  { name: "Midnight", primary: "#1e3a5f", accent: "#8be8ff" },
  { name: "Goblin",   primary: "#3a5c2a", accent: "#f8e16c" },
  { name: "Lava",     primary: "#b91c1c", accent: "#f97316" },
]

// ─── Sprite Canvas ────────────────────────────────────────────────────────────

function SpriteCanvas({
  spritesheetUrl,
  config,
  animation,
  scale = 3,
  tint,
}: {
  spritesheetUrl: string
  config: PetConfig
  animation: AnimationName
  scale?: number
  tint?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef    = useRef<number>(0)
  const frameRef  = useRef(0)
  const lastRef   = useRef(0)
  const imgRef    = useRef<HTMLImageElement | null>(null)

  const anim = config.sprite.animations[animation]
  const fw   = config.sprite.frameWidth
  const fh   = config.sprite.frameHeight
  const w    = fw * scale
  const h    = fh * scale

  useEffect(() => {
    const img = new Image()
    img.src = spritesheetUrl
    img.onload = () => { imgRef.current = img }
    return () => { imgRef.current = null }
  }, [spritesheetUrl])

  useEffect(() => {
    frameRef.current = 0
    lastRef.current  = 0
  }, [animation])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!
    ctx.imageSmoothingEnabled = false

    const interval = 1000 / anim.fps

    const draw = (ts: number) => {
      if (!imgRef.current) {
        rafRef.current = requestAnimationFrame(draw)
        return
      }
      if (ts - lastRef.current >= interval) {
        lastRef.current = ts
        if (frameRef.current < anim.frames - 1) {
          frameRef.current++
        } else if (anim.loop) {
          frameRef.current = 0
        }
      }

      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(
        imgRef.current,
        frameRef.current * fw,
        anim.row * fh,
        fw,
        fh,
        0,
        0,
        w,
        h,
      )

      // Optional tint overlay
      if (tint) {
        ctx.globalCompositeOperation = "multiply"
        ctx.fillStyle = tint
        ctx.fillRect(0, 0, w, h)
        ctx.globalCompositeOperation = "source-over"
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [anim, fw, fh, w, h, tint])

  return (
    <canvas
      ref={canvasRef}
      width={w}
      height={h}
      style={{ imageRendering: "pixelated", display: "block" }}
      aria-label={`${animation} animation`}
    />
  )
}

// ─── Stat Bar ─────────────────────────────────────────────────────────────────

function StatBar({ label, icon, value, max = 100, color }: {
  label: string; icon: string; value: number; max?: number; color: string
}) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, fontSize: 11 }}>
        <span>{icon} {label}</span>
        <span style={{ color: "var(--muted)" }}>{Math.round(value)}{max === 1000 ? "" : "%"}</span>
      </div>
      <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.4s" }} />
      </div>
    </div>
  )
}

// ─── Pet Card ──────────────────────────────────────────────────────────────────

function PetCard({
  pet,
  onAction,
}: {
  pet: GeneratedPet
  onAction: (action: string) => void
}) {
  const [currentAnim, setCurrentAnim] = useState<AnimationName>("idle")
  const [dialogue, setDialogue] = useState<string | null>(null)
  const [stats, setStats] = useState<PetStats>(pet.stats)

  const say = (text: string) => {
    setDialogue(text)
    setTimeout(() => setDialogue(null), 3000)
  }

  const triggerAnim = (anim: AnimationName, durationMs = 2000) => {
    setCurrentAnim(anim)
    const animDef = CLAWD_CONFIG.sprite.animations[anim]
    if (!animDef.loop) {
      setTimeout(() => setCurrentAnim("idle"), durationMs)
    }
  }

  const handlePet = () => {
    triggerAnim("bounce", 1500)
    setStats(s => ({ ...s, happiness: Math.min(100, s.happiness + 8), focus: Math.max(0, s.focus - 5) }))
    const lines = ["heh", "claws up", "don't interrupt the loop", "...ok fine"]
    say(lines[Math.floor(Math.random() * lines.length)])
    onAction("pet")
  }

  const handleFeed = () => {
    triggerAnim("celebrate", 2000)
    setStats(s => ({
      ...s,
      hunger: Math.min(100, s.hunger + 30),
      happiness: Math.min(100, s.happiness + 10),
      onchain_rep: s.onchain_rep + 1,
    }))
    const lines = ["CLAWD received. deploying energy.", "lamports confirmed. proceeding.", "this fuels the frontier."]
    say(lines[Math.floor(Math.random() * lines.length)])
    onAction("feed")
  }

  const handleRest = () => {
    triggerAnim("sleep")
    setStats(s => ({ ...s, energy: Math.min(100, s.energy + 40), focus: Math.min(100, s.focus + 20) }))
    say("...zzz")
    setTimeout(() => { setCurrentAnim("idle"); say("recharged.") }, 4000)
    onAction("rest")
  }

  const handleCode = () => {
    triggerAnim("code")
    setStats(s => ({
      ...s,
      energy: Math.max(0, s.energy - 15),
      focus: Math.max(0, s.focus - 20),
      onchain_rep: s.onchain_rep + 3,
    }))
    say("reading the diff...")
    onAction("code_review")
  }

  const handleGoblin = () => {
    if (stats.energy < 50) { say("not enough energy for goblin mode"); return }
    triggerAnim("run")
    setStats(s => ({
      ...s,
      energy: Math.max(0, s.energy - 30),
      happiness: Math.min(100, s.happiness + 20),
      onchain_rep: s.onchain_rep + 5,
    }))
    say("GOBLIN MODE ACTIVATED")
    onAction("goblin_mode")
  }

  const handleThink = () => {
    triggerAnim("think")
    say(pet.catchphrase)
    onAction("think")
  }

  return (
    <div style={{
      background: "var(--surface-strong)",
      border: "1px solid var(--line-strong)",
      borderRadius: 12,
      padding: 24,
      display: "flex",
      flexDirection: "column",
      gap: 16,
      maxWidth: 340,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          background: pet.primaryColor,
          borderRadius: 8,
          padding: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <SpriteCanvas
            spritesheetUrl={pet.spritesheetUrl}
            config={CLAWD_CONFIG}
            animation={currentAnim}
            scale={3}
          />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{pet.displayName}</div>
          <div style={{ color: "var(--muted)", fontSize: 11 }}>{pet.archetype}</div>
          <div style={{
            display: "inline-block",
            background: pet.accentColor,
            color: "#000",
            fontSize: 10,
            fontWeight: 700,
            borderRadius: 4,
            padding: "2px 6px",
            marginTop: 4,
          }}>{pet.mood}</div>
        </div>
      </div>

      {/* Speech bubble */}
      {dialogue && (
        <div style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid var(--line)",
          borderRadius: 8,
          padding: "8px 12px",
          fontSize: 12,
          color: "var(--cyan)",
          fontStyle: "italic",
        }}>
          "{dialogue}"
        </div>
      )}

      {/* Stats */}
      <div>
        <StatBar label="Hunger"     icon="🦀" value={stats.hunger}     color="var(--orange)" />
        <StatBar label="Energy"     icon="⚡" value={stats.energy}     color="var(--cyan)" />
        <StatBar label="Happiness"  icon="🧡" value={stats.happiness}  color="var(--green)" />
        <StatBar label="Focus"      icon="🧠" value={stats.focus}      color="var(--violet)" />
        <StatBar label="On-Chain Rep" icon="🔐" value={stats.onchain_rep} max={1000} color="var(--yellow)" />
      </div>

      {/* Actions */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {[
          { label: "Pet 🤚",         fn: handlePet    },
          { label: "Feed $CLAWD 🪙", fn: handleFeed   },
          { label: "Let Rest 💤",    fn: handleRest   },
          { label: "Code Review 🔍", fn: handleCode   },
          { label: "Think 💭",       fn: handleThink  },
          { label: "Goblin Mode 👺", fn: handleGoblin },
        ].map(({ label, fn }) => (
          <button
            key={label}
            onClick={fn}
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid var(--line)",
              borderRadius: 6,
              padding: "6px 8px",
              fontSize: 11,
              color: "var(--text)",
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Inject to Chat button */}
      <InjectToChatButton pet={pet} currentAnim={currentAnim} stats={stats} />
    </div>
  )
}

// ─── Inject to Chat ───────────────────────────────────────────────────────────

function InjectToChatButton({ pet, currentAnim, stats }: {
  pet: GeneratedPet
  currentAnim: AnimationName
  stats: PetStats
}) {
  const [injected, setInjected] = useState(false)

  const inject = () => {
    const mood = deriveMood(stats)
    const catchphrase = pet.catchphrase

    const petContext = [
      `[PET: ${pet.displayName} | ${pet.archetype} | mood: ${mood}]`,
      `Hunger ${Math.round(stats.hunger)}% · Energy ${Math.round(stats.energy)}% · Happiness ${Math.round(stats.happiness)}% · Focus ${Math.round(stats.focus)}% · Rep ${stats.onchain_rep}`,
      `Currently: ${currentAnim}`,
      `"${catchphrase}"`,
      `Token: ${pet.token}`,
    ].join("\n")

    // Write to localStorage so the main chat can pick it up
    localStorage.setItem("clawd-pet-context", petContext)
    localStorage.setItem("clawd-pet-active", JSON.stringify({
      id: pet.id,
      displayName: pet.displayName,
      mood,
      animation: currentAnim,
      stats,
      token: pet.token,
      catchphrase,
      accentColor: pet.accentColor,
      primaryColor: pet.primaryColor,
      spritesheetUrl: pet.spritesheetUrl,
    }))

    // Also dispatch a custom event so any open chat window can react immediately
    window.dispatchEvent(new CustomEvent("clawd-pet-inject", {
      detail: { petContext, pet, stats, animation: currentAnim },
    }))

    setInjected(true)
    setTimeout(() => setInjected(false), 2000)
  }

  return (
    <button
      onClick={inject}
      style={{
        background: injected ? "var(--green)" : "rgba(20,241,149,0.12)",
        border: `1px solid ${injected ? "var(--green)" : "rgba(20,241,149,0.3)"}`,
        borderRadius: 8,
        padding: "10px 16px",
        color: injected ? "#000" : "var(--green)",
        fontWeight: 700,
        fontSize: 13,
        cursor: "pointer",
        transition: "all 0.2s",
        width: "100%",
      }}
    >
      {injected ? "✓ Injected into chat" : "→ Inject into Chat"}
    </button>
  )
}

function deriveMood(stats: PetStats): PetMood {
  if (stats.energy < 15) return "depleted"
  if (stats.happiness > 80 && stats.energy > 60) return "elated"
  if (stats.focus > 70) return "focused"
  if (stats.energy < 30) return "drifting"
  if (stats.happiness < 30) return "goblin"
  return "curious"
}

// ─── Pet Generator ────────────────────────────────────────────────────────────

function PetGenerator({ onGenerate }: { onGenerate: (pet: GeneratedPet) => void }) {
  const [name,      setName]      = useState("")
  const [archetype, setArchetype] = useState(ARCHETYPES[0].id)
  const [token,     setToken]     = useState("$CLAWD")
  const [palette,   setPalette]   = useState(0)
  const [mood,      setMood]      = useState<PetMood>("curious")
  const [preview,   setPreview]   = useState<AnimationName>("idle")
  const [loading,   setLoading]   = useState(false)

  const spritesheetUrl = new URL("../assets/pet-spritesheet.webp", import.meta.url).href

  const generate = async () => {
    if (!name.trim()) return
    setLoading(true)

    await new Promise(r => setTimeout(r, 600))

    const arc = ARCHETYPES.find(a => a.id === archetype) ?? ARCHETYPES[0]
    const pal = PALETTE[palette]

    const catchphrases: Record<string, string[]> = {
      "hacker-philosopher": CLAWD_CONFIG.personality.catchphrases,
      "degen-trader":       ["YOLO is a risk management strategy.", "Size in. Pray later.", "red candles are just green candles in disguise"],
      "goblin-coder":       ["GOBLIN MODE ACTIVATED", "tick_sleep_ms=0", "the goblin ships at 3am", "code now, tests never"],
      "onchain-monk":       ["The chain is truth.", "Every tx is a prayer.", "Gas is the cost of conviction.", "settle on-chain or don't settle"],
      "market-sentinel":    ["Signal acquired.", "Noise cancelled.", "SMA crossover confirmed.", "Waiting for confirmation."],
    }

    const phrases = catchphrases[archetype] ?? CLAWD_CONFIG.personality.catchphrases
    const catchphrase = phrases[Math.floor(Math.random() * phrases.length)]

    const pet: GeneratedPet = {
      id:          `${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
      displayName: name.trim(),
      tagline:     CLAWD_CONFIG.tagline,
      archetype:   arc.label,
      token,
      primaryColor:  pal.primary,
      accentColor:   pal.accent,
      catchphrase,
      mood,
      stats: {
        hunger:     75,
        energy:     80,
        happiness:  65,
        focus:      50,
        onchain_rep: 0,
      },
      createdAt:    new Date().toISOString(),
      spritesheetUrl,
    }

    // Persist to localStorage
    const stored: GeneratedPet[] = JSON.parse(localStorage.getItem("clawd-pets") ?? "[]")
    stored.unshift(pet)
    localStorage.setItem("clawd-pets", JSON.stringify(stored.slice(0, 10)))

    setLoading(false)
    onGenerate(pet)
  }

  const animList: AnimationName[] = ["idle", "walk", "run", "think", "idea", "sleep", "code", "bounce", "celebrate"]

  return (
    <div style={{
      background: "var(--surface-strong)",
      border: "1px solid var(--line-strong)",
      borderRadius: 12,
      padding: 28,
      maxWidth: 460,
    }}>
      <h2 style={{ margin: "0 0 20px", fontSize: 18, color: "var(--green)" }}>
        ✦ Generate Your Agent Pet
      </h2>

      {/* Preview */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        marginBottom: 24,
        background: "rgba(255,255,255,0.03)",
        borderRadius: 10,
        padding: 16,
      }}>
        <div style={{
          background: PALETTE[palette].primary,
          borderRadius: 8,
          padding: 10,
          flexShrink: 0,
        }}>
          <SpriteCanvas
            spritesheetUrl={new URL("../assets/pet-spritesheet.webp", import.meta.url).href}
            config={CLAWD_CONFIG}
            animation={preview}
            scale={3}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, marginBottom: 8, color: "var(--muted)" }}>Preview animation:</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {animList.map(a => (
              <button
                key={a}
                onClick={() => setPreview(a)}
                style={{
                  fontSize: 10,
                  padding: "3px 7px",
                  borderRadius: 4,
                  border: `1px solid ${preview === a ? "var(--green)" : "var(--line)"}`,
                  background: preview === a ? "rgba(20,241,149,0.12)" : "transparent",
                  color: preview === a ? "var(--green)" : "var(--muted)",
                  cursor: "pointer",
                }}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Form */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={{ fontSize: 12 }}>
          <div style={{ color: "var(--muted)", marginBottom: 5 }}>Pet name</div>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Gobzo, Hexapod, Deepsea"
            style={{
              width: "100%",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid var(--line)",
              borderRadius: 6,
              padding: "8px 10px",
              color: "var(--text)",
              fontSize: 13,
            }}
          />
        </label>

        <label style={{ fontSize: 12 }}>
          <div style={{ color: "var(--muted)", marginBottom: 5 }}>Archetype</div>
          <select
            value={archetype}
            onChange={e => setArchetype(e.target.value)}
            style={{
              width: "100%",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid var(--line)",
              borderRadius: 6,
              padding: "8px 10px",
              color: "var(--text)",
              fontSize: 13,
            }}
          >
            {ARCHETYPES.map(a => (
              <option key={a.id} value={a.id}>{a.emoji} {a.label}</option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: 12 }}>
          <div style={{ color: "var(--muted)", marginBottom: 5 }}>Token</div>
          <input
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="$CLAWD"
            style={{
              width: "100%",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid var(--line)",
              borderRadius: 6,
              padding: "8px 10px",
              color: "var(--text)",
              fontSize: 13,
            }}
          />
        </label>

        <div style={{ fontSize: 12 }}>
          <div style={{ color: "var(--muted)", marginBottom: 5 }}>Color palette</div>
          <div style={{ display: "flex", gap: 8 }}>
            {PALETTE.map((p, i) => (
              <button
                key={p.name}
                onClick={() => setPalette(i)}
                title={p.name}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  background: p.primary,
                  border: `2px solid ${palette === i ? p.accent : "transparent"}`,
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
        </div>

        <div style={{ fontSize: 12 }}>
          <div style={{ color: "var(--muted)", marginBottom: 5 }}>Starting mood</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {MOODS.map(m => (
              <button
                key={m}
                onClick={() => setMood(m)}
                style={{
                  fontSize: 11,
                  padding: "4px 10px",
                  borderRadius: 20,
                  border: `1px solid ${mood === m ? "var(--green)" : "var(--line)"}`,
                  background: mood === m ? "rgba(20,241,149,0.12)" : "transparent",
                  color: mood === m ? "var(--green)" : "var(--muted)",
                  cursor: "pointer",
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={generate}
          disabled={!name.trim() || loading}
          style={{
            background: !name.trim() || loading
              ? "rgba(255,255,255,0.06)"
              : "rgba(20,241,149,0.15)",
            border: `1px solid ${!name.trim() || loading ? "var(--line)" : "rgba(20,241,149,0.4)"}`,
            borderRadius: 8,
            padding: "12px 20px",
            color: !name.trim() || loading ? "var(--muted)" : "var(--green)",
            fontWeight: 700,
            fontSize: 14,
            cursor: !name.trim() || loading ? "not-allowed" : "pointer",
            transition: "all 0.2s",
          }}
        >
          {loading ? "Spawning…" : "✦ Spawn Agent Pet"}
        </button>
      </div>
    </div>
  )
}

// ─── Animation Gallery ─────────────────────────────────────────────────────────

function AnimGallery() {
  const spritesheetUrl = new URL("../assets/pet-spritesheet.webp", import.meta.url).href
  const anims: AnimationName[] = ["idle", "walk", "run", "think", "idea", "sleep", "code", "bounce", "celebrate"]

  return (
    <div>
      <h3 style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        Sprite Gallery
      </h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {anims.map(a => (
          <div key={a} style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid var(--line)",
            borderRadius: 8,
            padding: 10,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
          }}>
            <div style={{ background: "#1a0d00", borderRadius: 6, padding: 6 }}>
              <SpriteCanvas
                spritesheetUrl={spritesheetUrl}
                config={CLAWD_CONFIG}
                animation={a}
                scale={2}
              />
            </div>
            <div style={{ fontSize: 10, color: "var(--muted)" }}>{a}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Saved Pets ─────────────────────────────────────────────────────────────────

function SavedPets({ onSelect }: { onSelect: (pet: GeneratedPet) => void }) {
  const [pets, setPets] = useState<GeneratedPet[]>([])

  useEffect(() => {
    const stored: GeneratedPet[] = JSON.parse(localStorage.getItem("clawd-pets") ?? "[]")
    setPets(stored)
  }, [])

  if (pets.length === 0) return null

  return (
    <div>
      <h3 style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        Your Pets
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {pets.map(pet => (
          <button
            key={pet.id}
            onClick={() => onSelect(pet)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              padding: "8px 12px",
              color: "var(--text)",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <div style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: pet.accentColor,
              flexShrink: 0,
            }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{pet.displayName}</div>
              <div style={{ fontSize: 10, color: "var(--muted)" }}>{pet.archetype} · {pet.token}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Chat Overlay (floating pet in chat) ──────────────────────────────────────

export function PetChatOverlay() {
  const [active, setActive] = useState<GeneratedPet & { animation: AnimationName } | null>(null)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem("clawd-pet-active")
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        setActive(parsed)
      } catch { /* ignore */ }
    }

    const handler = (e: Event) => {
      const ev = e as CustomEvent
      if (ev.detail?.pet) {
        setActive({ ...ev.detail.pet, animation: ev.detail.animation ?? "idle" })
        setVisible(true)
      }
    }

    window.addEventListener("clawd-pet-inject", handler)
    return () => window.removeEventListener("clawd-pet-inject", handler)
  }, [])

  if (!active || !visible) return null

  return (
    <div style={{
      position: "fixed",
      bottom: 80,
      right: 20,
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
      gap: 6,
      zIndex: 9999,
      pointerEvents: "auto",
    }}>
      <button
        onClick={() => setVisible(false)}
        style={{
          fontSize: 10,
          background: "transparent",
          border: "none",
          color: "var(--muted)",
          cursor: "pointer",
          padding: "2px 6px",
        }}
      >
        ✕
      </button>
      <div style={{
        background: "var(--surface-strong)",
        border: `1px solid ${active.accentColor}44`,
        borderRadius: 10,
        padding: "6px 10px",
        fontSize: 10,
        color: "var(--muted)",
        maxWidth: 140,
        textAlign: "center",
      }}>
        {active.displayName} · {active.mood}
      </div>
      <div style={{
        background: active.primaryColor,
        borderRadius: 10,
        padding: 8,
        boxShadow: `0 0 12px ${active.accentColor}44`,
        cursor: "pointer",
      }}
        title={`${active.displayName} — click /pet to manage`}
        onClick={() => { window.location.href = "/pet" }}
      >
        <SpriteCanvas
          spritesheetUrl={active.spritesheetUrl}
          config={CLAWD_CONFIG}
          animation={active.animation ?? "idle"}
          scale={2}
        />
      </div>
    </div>
  )
}

// ─── Main PetApp ──────────────────────────────────────────────────────────────

export default function PetApp() {
  const [activePet, setActivePet] = useState<GeneratedPet | null>(null)
  const [tab,       setTab]       = useState<"generate" | "gallery">("generate")

  // Load last active pet on mount
  useEffect(() => {
    const stored = localStorage.getItem("clawd-pet-active")
    if (stored) {
      try { setActivePet(JSON.parse(stored)) } catch { /* ignore */ }
    }
  }, [])

  const handleGenerate = (pet: GeneratedPet) => {
    setActivePet(pet)
  }

  const handleAction = (_action: string) => {
    // placeholder for analytics / future on-chain actions
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Header */}
      <header style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "18px 24px",
        borderBottom: "1px solid var(--line)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <a href="/" style={{ color: "var(--muted)", fontSize: 13 }}>← back</a>
          <span style={{ color: "var(--line)" }}>|</span>
          <span style={{ fontWeight: 700, color: "var(--green)", fontSize: 16 }}>clawd<span style={{ color: "var(--text)" }}>.pet</span></span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {(["generate", "gallery"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                fontSize: 12,
                padding: "5px 12px",
                borderRadius: 6,
                border: `1px solid ${tab === t ? "var(--green)" : "var(--line)"}`,
                background: tab === t ? "rgba(20,241,149,0.1)" : "transparent",
                color: tab === t ? "var(--green)" : "var(--muted)",
                cursor: "pointer",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </header>

      {/* Body */}
      <div style={{
        width: "min(1200px, 100%)",
        margin: "0 auto",
        padding: "32px 24px",
      }}>
        {tab === "generate" ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, alignItems: "start" }}>
            {/* Left: generator */}
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <div>
                <h1 style={{ margin: "0 0 6px", fontSize: 24 }}>Agent Pets</h1>
                <p style={{ margin: 0, color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>
                  Spawn a pixel companion. Inject it into chat to bring personality to your sessions.
                </p>
              </div>

              <PetGenerator onGenerate={handleGenerate} />

              <SavedPets onSelect={setActivePet} />
            </div>

            {/* Right: active pet card */}
            <div style={{ display: "flex", flexDirection: "column", gap: 24, alignItems: "start" }}>
              {activePet ? (
                <PetCard pet={activePet} onAction={handleAction} />
              ) : (
                <div style={{
                  background: "var(--surface)",
                  border: "1px dashed var(--line)",
                  borderRadius: 12,
                  padding: 32,
                  textAlign: "center",
                  color: "var(--muted)",
                  fontSize: 13,
                  width: "100%",
                }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>🦀</div>
                  <div>No pet spawned yet.</div>
                  <div style={{ marginTop: 4, fontSize: 11 }}>Fill out the form and hit "Spawn Agent Pet"</div>
                </div>
              )}

              {/* Chat injection info */}
              <div style={{
                background: "rgba(20,241,149,0.04)",
                border: "1px solid rgba(20,241,149,0.15)",
                borderRadius: 10,
                padding: "14px 16px",
                fontSize: 12,
                color: "var(--muted)",
                lineHeight: 1.7,
                width: "100%",
              }}>
                <div style={{ fontWeight: 700, color: "var(--green)", marginBottom: 6 }}>Chat injection</div>
                Once you click <strong style={{ color: "var(--text)" }}>→ Inject into Chat</strong>, your pet's context (name, mood, stats, catchphrase) is embedded into every new conversation as system context. The pet appears as a floating overlay in the chat window.
              </div>
            </div>
          </div>
        ) : (
          <AnimGallery />
        )}
      </div>
    </div>
  )
}
