import React from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import "./styles.css";

type FlowStatus = "queued" | "start" | "done" | "error";

interface FlowEvent {
  id: string;
  ts: number;
  kind: "chat" | "inference" | "async" | "warmup" | "solgpt";
  route: string;
  status: FlowStatus;
  model?: string;
  request_id?: string;
  elapsed_ms?: number;
  error?: string;
}

interface Peer {
  alloc_id: string;
  region: string;
  load: number;
}

interface MeshInfo {
  self: string;
  region: string;
  load: number;
  peers: Peer[];
}

interface VizState {
  ok: boolean;
  node: string;
  node_pubkey: string;
  uptime_seconds: number;
  active_reqs: number;
  public_inference_enabled: boolean;
  ollama: {
    ready: boolean;
    host: string;
    models: string[];
  };
  jobs: {
    total: number;
    counts: {
      pending: number;
      done: number;
      error: number;
    };
  };
  mesh: MeshInfo;
  peers: number;
  flow: FlowEvent[];
  now: number;
}

interface SolGptStatus {
  ok: boolean;
  node: string;
  public_inference_enabled: boolean;
  default_local_model?: string;
  local_models: string[];
  local_preferences: string[];
  openrouter: {
    enabled: boolean;
    free_only: boolean;
    fallback_models: string[];
  };
}

interface SolGptMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  provider?: string;
  model?: string;
  elapsedMs?: number;
  fallbackUsed?: boolean;
}

const EMPTY_STATE: VizState = {
  ok: false,
  node: "-",
  node_pubkey: "-",
  uptime_seconds: 0,
  active_reqs: 0,
  public_inference_enabled: true,
  ollama: { ready: false, host: "-", models: [] },
  jobs: { total: 0, counts: { pending: 0, done: 0, error: 0 } },
  mesh: { self: "-", region: "-", load: 0, peers: [] },
  peers: 0,
  flow: [],
  now: Date.now(),
};

const routeColors: Record<FlowEvent["kind"], string> = {
  chat: "#38bdf8",
  inference: "#2dd4bf",
  async: "#f59e0b",
  warmup: "#a78bfa",
  solgpt: "#22c55e",
};

function short(value: string, left = 8, right = 4): string {
  if (!value || value.length <= left + right + 2) return value || "-";
  if (right <= 0) return `${value.slice(0, left)}...`;
  return `${value.slice(0, left)}...${value.slice(-right)}`;
}

function useMeshState(adminKey: string) {
  const [state, setState] = React.useState<VizState>(EMPTY_STATE);
  const [error, setError] = React.useState<string>("");

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/mesh/visualization", { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const next = (await res.json()) as VizState;

      if (adminKey) {
        const adminRes = await fetch("/admin/api/status", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${adminKey}` },
        });
        if (adminRes.ok) {
          const admin = await adminRes.json() as Partial<VizState>;
          next.public_inference_enabled = Boolean(admin.public_inference_enabled);
          next.active_reqs = Number(admin.active_reqs ?? next.active_reqs);
          next.jobs = admin.jobs ?? next.jobs;
          next.ollama = admin.ollama ?? next.ollama;
        }
      }

      setState(next);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load mesh state");
    }
  }, [adminKey]);

  React.useEffect(() => {
    let active = true;
    const tick = async () => {
      if (active) await load();
    };
    tick();
    const timer = window.setInterval(tick, 1800);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [load]);

  return { state, error, reload: load };
}

function colorForModel(model: string, index: number): string {
  const palette = ["#2dd4bf", "#38bdf8", "#f59e0b", "#f87171", "#a78bfa", "#84cc16", "#fb7185"];
  let sum = index;
  for (const char of model) sum += char.charCodeAt(0);
  return palette[sum % palette.length];
}

function polar(index: number, total: number, radius: number, offset = 0): [number, number, number] {
  const angle = offset + (index / Math.max(total, 1)) * Math.PI * 2;
  return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius];
}

function Ring({ radius, color, opacity = 0.28 }: { radius: number; color: string; opacity?: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[radius - 0.012, radius + 0.012, 96]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} side={THREE.DoubleSide} />
    </mesh>
  );
}

function CoreNode({ state }: { state: VizState }) {
  const ref = React.useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.35;
  });

  return (
    <group>
      <Ring radius={1.24} color={state.public_inference_enabled ? "#2dd4bf" : "#f59e0b"} opacity={0.45} />
      <mesh ref={ref}>
        <icosahedronGeometry args={[0.78, 2]} />
        <meshStandardMaterial
          color={state.ok ? "#2dd4bf" : "#f59e0b"}
          emissive={state.ok ? "#0f766e" : "#92400e"}
          emissiveIntensity={0.8}
          roughness={0.42}
          metalness={0.18}
        />
      </mesh>
      <mesh scale={[1.8 + state.active_reqs * 0.08, 1.8 + state.active_reqs * 0.08, 1.8 + state.active_reqs * 0.08]}>
        <sphereGeometry args={[0.62, 32, 32]} />
        <meshBasicMaterial color="#2dd4bf" transparent opacity={0.07 + Math.min(state.active_reqs, 5) * 0.02} />
      </mesh>
    </group>
  );
}

function LinkBeam({ to, active }: { to: [number, number, number]; active: boolean }) {
  const length = Math.sqrt(to[0] * to[0] + to[2] * to[2]);
  const angle = Math.atan2(-to[2], to[0]);
  return (
    <mesh position={[to[0] / 2, -0.02, to[2] / 2]} rotation={[0, angle, 0]}>
      <boxGeometry args={[length, 0.018, 0.018]} />
      <meshBasicMaterial color={active ? "#1d4ed8" : "#26334d"} transparent opacity={active ? 0.36 : 0.24} />
    </mesh>
  );
}

function PeerNodes({ peers }: { peers: Peer[] }) {
  const visiblePeers = peers.length > 0
    ? peers
    : [{ alloc_id: "standby-a", region: "ord", load: 0 }, { alloc_id: "standby-b", region: "sjc", load: 0 }, { alloc_id: "standby-c", region: "lax", load: 0 }];

  return (
    <group>
      <Ring radius={4.6} color="#475569" opacity={0.22} />
      {visiblePeers.map((peer, index) => {
        const position = polar(index, visiblePeers.length, 4.6, Math.PI / 5);
        const active = peers.length > 0;
        const scale = active ? 0.42 + peer.load * 0.35 : 0.26;
        return (
          <React.Fragment key={peer.alloc_id}>
            <LinkBeam to={position} active={active} />
            <group position={position}>
              <mesh>
                <sphereGeometry args={[scale, 28, 28]} />
                <meshStandardMaterial
                  color={active ? "#38bdf8" : "#334155"}
                  emissive={active ? "#075985" : "#0f172a"}
                  emissiveIntensity={active ? 0.5 : 0.1}
                  transparent
                  opacity={active ? 0.95 : 0.38}
                />
              </mesh>
            </group>
          </React.Fragment>
        );
      })}
    </group>
  );
}

function ModelOrbit({ models }: { models: string[] }) {
  const groupRef = React.useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y -= delta * 0.08;
  });

  const visibleModels = models.slice(0, 16);
  return (
    <group ref={groupRef} position={[0, -0.05, 0]}>
      <Ring radius={2.6} color="#64748b" opacity={0.2} />
      {visibleModels.map((model, index) => {
        const [x, y, z] = polar(index, visibleModels.length, 2.6, Math.PI / 9);
        return (
          <mesh key={model} position={[x, y + Math.sin(index) * 0.08, z]}>
            <boxGeometry args={[0.32, 0.32, 0.32]} />
            <meshStandardMaterial color={colorForModel(model, index)} emissive={colorForModel(model, index)} emissiveIntensity={0.18} />
          </mesh>
        );
      })}
    </group>
  );
}

function FlowPulse({ event, index, now }: { event: FlowEvent; index: number; now: number }) {
  const ref = React.useRef<THREE.Mesh>(null);
  const color = event.status === "error" ? "#f87171" : routeColors[event.kind];

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const age = Math.max(0, now - event.ts);
    const progress = ((age / 2600) + (clock.elapsedTime * 0.11) + index * 0.07) % 1;
    const radius = event.kind === "chat" ? 3.8 : event.kind === "warmup" ? 2.2 : 3.0;
    const angle = progress * Math.PI * 2 + index * 0.42;
    ref.current.position.set(Math.cos(angle) * radius, 0.28 + Math.sin(progress * Math.PI) * 0.36, Math.sin(angle) * radius);
    const size = event.status === "queued" ? 0.14 : 0.18;
    ref.current.scale.setScalar(size + Math.sin(clock.elapsedTime * 5 + index) * 0.025);
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[1, 16, 16]} />
      <meshBasicMaterial color={color} transparent opacity={event.status === "done" ? 0.68 : 0.9} />
    </mesh>
  );
}

function MeshScene({ state }: { state: VizState }) {
  const sceneRef = React.useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (sceneRef.current) sceneRef.current.rotation.y += delta * 0.018;
  });

  return (
    <>
      <color attach="background" args={["#07111f"]} />
      <ambientLight intensity={0.65} />
      <pointLight position={[4, 7, 5]} intensity={52} color="#9cc6ff" />
      <pointLight position={[-5, 3, -4]} intensity={22} color="#2dd4bf" />
      <group ref={sceneRef}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.72, 0]}>
          <circleGeometry args={[6.8, 96]} />
          <meshBasicMaterial color="#0f172a" transparent opacity={0.56} />
        </mesh>
        <CoreNode state={state} />
        <ModelOrbit models={state.ollama.models} />
        <PeerNodes peers={state.mesh.peers} />
        {state.flow.slice(-26).map((event, index) => (
          <FlowPulse key={`${event.id}-${index}`} event={event} index={index} now={state.now} />
        ))}
      </group>
    </>
  );
}

function Metric({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "ok" | "warn" | "bad" }) {
  return (
    <div className={`metric ${tone ?? ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SolGptApp() {
  const [status, setStatus] = React.useState<SolGptStatus | null>(null);
  const [messages, setMessages] = React.useState<SolGptMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Sol GPT is online. Ask about Solana, wallets, tokens, programs, trading workflows, or anything you would normally send to GPT.",
      provider: "mesh",
    },
  ]);
  const [input, setInput] = React.useState("");
  const [model, setModel] = React.useState("sol-gpt/auto");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const loadStatus = React.useCallback(async () => {
    const res = await fetch("/api/sol-gpt/status", { cache: "no-store" });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const next = await res.json() as SolGptStatus;
    setStatus(next);
    if (model === "sol-gpt/auto" && next.default_local_model) {
      setModel("sol-gpt/auto");
    }
  }, [model]);

  React.useEffect(() => {
    loadStatus().catch((err) => setError(err instanceof Error ? err.message : "Unable to load Sol GPT"));
    const timer = window.setInterval(() => {
      loadStatus().catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [loadStatus]);

  async function sendMessage(event?: React.FormEvent) {
    event?.preventDefault();
    const content = input.trim();
    if (!content || busy) return;

    const userMessage: SolGptMessage = { id: `user-${Date.now()}`, role: "user", content };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    setError("");
    const started = Date.now();

    try {
      const res = await fetch("/api/sol-gpt/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: nextMessages
            .filter(message => message.role === "user" || message.role === "assistant")
            .slice(-12)
            .map(message => ({ role: message.role, content: message.content })),
          temperature: 0.65,
          max_tokens: 700,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `status ${res.status}`);
      const choices = Array.isArray(data.choices) ? data.choices : [];
      const contentOut = choices[0]?.message?.content;
      const solGpt = data.sol_gpt ?? {};
      setMessages(current => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: typeof contentOut === "string" && contentOut.trim() ? contentOut : "No response content returned.",
          provider: typeof solGpt.provider === "string" ? solGpt.provider : "mesh",
          model: typeof solGpt.model === "string" ? solGpt.model : data.model,
          elapsedMs: Date.now() - started,
          fallbackUsed: Boolean(solGpt.fallback_used),
        },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sol GPT request failed";
      setError(message);
      setMessages(current => [
        ...current,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          content: `Sol GPT could not answer: ${message}`,
          provider: "error",
        },
      ]);
    } finally {
      setBusy(false);
      loadStatus().catch(() => undefined);
    }
  }

  const localModels = status?.local_models ?? [];
  const fallbackModels = status?.openrouter.fallback_models ?? [];

  return (
    <div className="solGptShell">
      <header className="solGptTopbar">
        <div>
          <h1>Sol GPT</h1>
          <div className="subline">
            <span className={status?.public_inference_enabled ? "dot ok" : "dot warn"} />
            <code>{status?.node ?? "-"}</code>
            <span>{status?.public_inference_enabled ? "free inference online" : "public inference disabled"}</span>
            <span>{status?.openrouter.enabled ? "OpenRouter fallback ready" : "mesh only"}</span>
          </div>
        </div>
        <nav className="solGptNav">
          <a href="/">Mesh</a>
          <a href="/admin">Admin</a>
        </nav>
      </header>

      <main className="solGptMain">
        <section className="chatSurface">
          <div className="messageList">
            {messages.map((message) => (
              <article key={message.id} className={`message ${message.role}`}>
                <div className="messageMeta">
                  <strong>{message.role === "user" ? "You" : "Sol GPT"}</strong>
                  {message.provider && <span>{message.provider}</span>}
                  {message.model && <code>{message.model}</code>}
                  {message.elapsedMs && <span>{message.elapsedMs}ms</span>}
                  {message.fallbackUsed && <span>fallback</span>}
                </div>
                <p>{message.content}</p>
              </article>
            ))}
          </div>

          <form className="composer" onSubmit={sendMessage}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask Sol GPT..."
              rows={3}
              disabled={busy || status?.public_inference_enabled === false}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) sendMessage(event);
              }}
            />
            <div className="composerActions">
              <select value={model} onChange={(event) => setModel(event.target.value)}>
                <option value="sol-gpt/auto">Sol GPT Auto</option>
                {localModels.map((localModel) => (
                  <option key={localModel} value={localModel}>{localModel}</option>
                ))}
              </select>
              <button disabled={busy || !input.trim() || status?.public_inference_enabled === false}>
                {busy ? "Thinking" : "Send"}
              </button>
            </div>
          </form>
          {error && <div className="solGptError">{error}</div>}
        </section>

        <aside className="solGptSide">
          <section className="panelBlock">
            <h2>Runtime</h2>
            <div className="routeList">
              <div><span>default</span><code>{status?.default_local_model ?? "-"}</code></div>
              <div><span>local</span><code>{localModels.length} models</code></div>
              <div><span>fallback</span><code>{status?.openrouter.enabled ? "enabled" : "not configured"}</code></div>
            </div>
          </section>
          <section className="panelBlock">
            <h2>Local Models</h2>
            <div className="modelList compact">
              {localModels.slice(0, 10).map((localModel, index) => (
                <button
                  key={localModel}
                  className={model === localModel ? "model active" : "model"}
                  onClick={() => setModel(localModel)}
                  style={{ "--model-color": colorForModel(localModel, index) } as React.CSSProperties}
                >
                  <span />
                  {localModel}
                </button>
              ))}
            </div>
          </section>
          <section className="panelBlock">
            <h2>Free Fallbacks</h2>
            <div className="fallbackList">
              {fallbackModels.slice(0, 8).map((fallback) => (
                <code key={fallback}>{fallback}</code>
              ))}
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}

function MeshDashboard() {
  const [adminKey, setAdminKey] = React.useState(() => sessionStorage.getItem("mesh-admin-key") ?? "");
  const [draftKey, setDraftKey] = React.useState(adminKey);
  const [selectedModel, setSelectedModel] = React.useState("");
  const [action, setAction] = React.useState("");
  const { state, error, reload } = useMeshState(adminKey);

  React.useEffect(() => {
    if (!selectedModel && state.ollama.models.length > 0) setSelectedModel(state.ollama.models[0]);
  }, [selectedModel, state.ollama.models]);

  async function adminPost(path: string, body: unknown) {
    if (!adminKey) {
      setAction("admin key required");
      return;
    }
    setAction("working");
    const res = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminKey}`,
      },
      body: JSON.stringify(body),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) setAction(payload.error ?? `status ${res.status}`);
    else setAction("ok");
    await reload();
  }

  function saveKey() {
    const next = draftKey.trim();
    setAdminKey(next);
    if (next) sessionStorage.setItem("mesh-admin-key", next);
    else sessionStorage.removeItem("mesh-admin-key");
  }

  const latestFlow = [...state.flow].reverse().slice(0, 8);

  return (
    <div className="appShell">
      <div className="sceneLayer">
        <Canvas
          camera={{ position: [0, 6.4, 9.2], fov: 48 }}
          dpr={[1, 1.75]}
          gl={{ antialias: true, preserveDrawingBuffer: true }}
        >
          <MeshScene state={state} />
        </Canvas>
      </div>

      <header className="topbar">
        <div>
          <h1>Clawd Inference Mesh</h1>
          <div className="subline">
            <span className={state.ok ? "dot ok" : "dot warn"} />
            <code>{state.node}</code>
            <span>{state.mesh.region}</span>
            <span>{state.public_inference_enabled ? "public enabled" : "public disabled"}</span>
          </div>
        </div>
        <div className="adminKey">
          <input
            type="password"
            placeholder="Admin key"
            value={draftKey}
            onChange={(event) => setDraftKey(event.target.value)}
          />
          <button onClick={saveKey}>Use Key</button>
          <a href="/sol-gpt">Sol GPT</a>
          <a href="/admin">Admin</a>
        </div>
      </header>

      <aside className="leftPanel panel">
        <div className="metrics">
          <Metric label="Ollama" value={state.ollama.ready ? "online" : "offline"} tone={state.ollama.ready ? "ok" : "bad"} />
          <Metric label="Requests" value={state.active_reqs} />
          <Metric label="Models" value={state.ollama.models.length} />
          <Metric label="Peers" value={state.peers} />
          <Metric label="Jobs" value={state.jobs.total} />
          <Metric label="Load" value={`${Math.round(state.mesh.load * 100)}%`} />
        </div>
        <div className="controlRow">
          <button onClick={() => adminPost("/admin/api/traffic", { enabled: true })}>Enable</button>
          <button onClick={() => adminPost("/admin/api/traffic", { enabled: false })}>Disable</button>
          <button onClick={() => adminPost("/admin/api/warmup", { model: selectedModel || undefined })}>Warm</button>
        </div>
        <select value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)}>
          {state.ollama.models.map((model) => (
            <option key={model} value={model}>{model}</option>
          ))}
        </select>
        <div className="notice">{error || action || short(state.node_pubkey, 12, 8)}</div>
      </aside>

      <aside className="rightPanel panel">
        <section>
          <h2>Models</h2>
          <div className="modelList">
            {state.ollama.models.slice(0, 12).map((model, index) => (
              <button
                key={model}
                className={selectedModel === model ? "model active" : "model"}
                onClick={() => setSelectedModel(model)}
                style={{ "--model-color": colorForModel(model, index) } as React.CSSProperties}
              >
                <span />
                {model}
              </button>
            ))}
          </div>
        </section>
        <section>
          <h2>Routing</h2>
          <div className="routeList">
            <div><span>self</span><code>{short(state.mesh.self, 10, 4)}</code></div>
            {state.mesh.peers.length === 0 && <div><span>peers</span><code>standby</code></div>}
            {state.mesh.peers.map((peer) => (
              <div key={peer.alloc_id}><span>{peer.region}</span><code>{short(peer.alloc_id, 10, 4)} · {Math.round(peer.load * 100)}%</code></div>
            ))}
          </div>
        </section>
      </aside>

      <footer className="flowPanel panel">
        <h2>Flow</h2>
        <div className="flowList">
          {latestFlow.length === 0 && <span className="empty">waiting for traffic</span>}
          {latestFlow.map((event) => (
            <div key={event.id} className={`flowItem ${event.status}`}>
              <span style={{ background: event.status === "error" ? "#f87171" : routeColors[event.kind] }} />
              <code>{event.kind}</code>
              <strong>{event.status}</strong>
              <em>{event.model ? short(event.model, 22, 0) : event.route}</em>
              <small>{event.elapsed_ms ? `${event.elapsed_ms}ms` : ""}</small>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}

function App() {
  return window.location.pathname.startsWith("/sol-gpt") ? <SolGptApp /> : <MeshDashboard />;
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
