import React, { useState } from "react";
import { 
  Terminal, 
  Search, 
  BookOpen, 
  Cpu, 
  FileText, 
  Layers, 
  Sliders, 
  AlertTriangle, 
  ExternalLink,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Play
} from "lucide-react";

export default function CypherDocs() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"models" | "prereq" | "tools" | "trouble">("models");
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>("m3-claude");

  const triggerCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const modelSpecs = {
    language: [
      { name: "MiniMax-M3", type: "Frontier Multimodal API", desc: "Frontier coding, reasoning, and multi-turn dialogue. 1M context window. SOTA performance.", features: "1M Token Context, Code Synthesis, Multimodal Inputs" },
      { name: "MiniMax-M2.7", type: "Recursive Self-Improvement", desc: "Top tier real-world engineering and character-rich interaction. Professional office work.", features: "Recursive logic, precise output formats, character roleplay" },
      { name: "MiniMax-M2.7-highspeed", type: "Fast Inference Edition", desc: "Equivalent logical performance as M2.7 with significantly lower generation latency.", features: "Low latency, polyglot refactoring, speed" },
      { name: "MiniMax-M2.5 / M2.5-highspeed", type: "Legacy Code Optimization", desc: "Prior generation models highly optimized for code synthesis and quick adjustments.", features: "Efficient reasoning, baseline speed" }
    ],
    video: [
      { name: "MiniMax Hailuo 2.3", type: "State-of-the-Art Motion", desc: "Text-to-Video & Image-to-Video. Peak physical system simulation. 1080p, 6s or 10s output.", features: "Extreme physics mastery, 24 FPS standard" },
      { name: "MiniMax Hailuo 2.3Fast", type: "Instant Frame Delivery", desc: "High efficiency image-to-video, optimized to save computing cycles and prompt costs.", features: "Fast billing, excellent frame stability" }
    ],
    audioMusic: [
      { name: "speech-2.8-hd", type: "Ultra-Realistic Audio", desc: "Native sound tags and human vocal emotional spectrums in 40+ global languages.", features: "Dialect preservation, 7 default emotional layers" },
      { name: "speech-2.8-turbo", type: "Real-time TTS Streaming", desc: "Low-latency seamless audio synthesis for conversational voice bots and assistants.", features: "Ultra low latency processing" },
      { name: "Music-2.6", type: "Bass-heavy Generation", desc: "Advanced algorithmic track synthesis. Cover versioning and natural vocal tracking.", features: "Auto lyrics extraction, acoustic conversion" }
    ]
  };

  const integrations = [
    {
      id: "m3-claude",
      title: "Claude Code CLI Integration",
      desc: "Configure MiniMax-M3 as the default logical router in Anthropic's Claude Code CLI. This routes high speed commands locally using the Anthropic API compatibility layer.",
      code: `// File: ~/.claude/settings.json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.minimax.io/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "<YOUR_MINIMAX_API_KEY>",
    "API_TIMEOUT_MS": "3000000",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
    "ANTHROPIC_MODEL": "MiniMax-M3",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "MiniMax-M3",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "MiniMax-M3",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "MiniMax-M3"
  }
}`,
      verify: "Run key commands within Claude Code terminal:\n> /status\n> /model"
    },
    {
      id: "cursor",
      title: "Cursor IDE Configuration",
      desc: "Configure Cursor Pro with your MiniMax subscription. Overrides OpenAI Base URL to direct internal autocomplete and code gen to MiniMax endpoints.",
      steps: [
        "Go to Cursor Settings -> Models tab in the left sidebar.",
        "Toggle 'Override OpenAI Base URL' to active.",
        "Enter MiniMax Base URL: 'https://api.minimax.io/v1' (or 'https://api.minimaxi.com/v1' inside CN region).",
        "Paste your direct secret MiniMax API Key into the OpenAI Key field.",
        "Click '+ Add Custom Model' and enter the model ID string: 'MiniMax-M3' exactly.",
        "Enable the newly added model and select MiniMax-M3 in critical chat slots."
      ]
    },
    {
      id: "trae",
      title: "TRAE IDE Setup Guide",
      desc: "Add MiniMax-M3 directly into the custom model registry of ByteDance's free TRAE editor.",
      steps: [
        "Open TRAE, click the gear icon in the top right of the side-chat component, and view the Models menu.",
        "Click '+ Add Model' inside the pop-up modal.",
        "Select Provider: 'MiniMax-Global'.",
        "Select Model: 'MiniMax-M3'.",
        "Input your direct custom Secret API Key and click confirm."
      ]
    },
    {
      id: "openclaw",
      title: "OpenClaw AI Installation",
      desc: "Connect your global MiniMax billing credentials into OpenClaw's modular multi-channel agent framework.",
      code: `# Command to download and initialize OpenClaw
curl -fsSL https://openclaw.ai/install.sh | bash

# 1. Select "Yes" and select "QuickStart"
# 2. Select "MiniMax" as your main intelligence resource
# 3. Choose "MiniMax Global - OAuth (minimax.io)"
# 4. Authorize in web browser and return to CLI
# 5. Connect to Telegram / WhatsApp / Discord channels`
    },
    {
      id: "hermes",
      title: "Hermes Agent Console Integration",
      desc: "Nous Research's self-improving persistent agent shell with support for global MiniMax models.",
      code: `# Run Hermes installation
curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash

# Select physical model source
hermes model

# Select [MiniMax (global endpoint)] from list and output your Token Plan key.`
    },
    {
      id: "cline-roo",
      title: "Cline / Roo Code Extensions (VS Code)",
      desc: "Integrate native computer control tasks, browser capabilities, and automated file-editing into VS Code with Roo/Cline and M3.",
      steps: [
        "Open Cline Settings in the VS Code sidebar dashboard.",
        "Under API Provider selection list, choice 'MiniMax'.",
        "Input your primary secret key.",
        "For Entrypoint selection, choose 'api.minimax.io' or 'api.minimaxi.com'.",
        "Under model tracking parameters, select 'MiniMax-M3'. Click Done to lock."
      ]
    }
  ];

  return (
    <div className="bg-black/90 border border-[#9945FF]/20 rounded-2xl p-5 font-mono text-zinc-300 shadow-2xl relative overflow-hidden select-text">
      {/* Aesthetic Glitch Lines */}
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#9945FF] to-transparent animate-pulse" />
      <div className="absolute -right-2 top-10 w-24 h-24 bg-[#9945FF]/5 rounded-full blur-2xl pointer-events-none" />

      {/* Terminal Title */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#9945FF]/30 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-[#9945FF]/10 flex items-center justify-center border border-[#9945FF]/30 shadow-[0_0_12px_rgba(153,69,255,0.15)] shrink-0">
            <Terminal className="w-4 h-4 text-[#9945FF] animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black uppercase tracking-wider text-white">MINIMAX LOBSTER-CODEX</h2>
              <span className="text-[9px] font-bold text-black bg-[#9945FF] px-1.5 py-0.5 rounded uppercase tracking-widest animate-pulse">CYPHER TERMINAL</span>
            </div>
            <p className="text-[10px] text-zinc-500">Lobster Dark DeFi Mainframe & Multi-Model Intelligence Index</p>
          </div>
        </div>

        {/* Global search */}
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Query model specs / CLI cmds..."
            className="w-full bg-zinc-950 border border-[#9945FF]/30 rounded-lg py-1.5 pl-8 pr-3 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[#9945FF] focus:ring-1 focus:ring-[#9945FF]/20 transition-all"
          />
          <Search className="w-3.5 h-3.5 text-[#9945FF]/60 absolute left-2.5 top-2.5" />
        </div>
      </div>

      {/* Tab Selectors */}
      <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800 my-4 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab("models")}
          className={`flex-1 py-1.5 px-3 rounded-md text-[10px] font-bold uppercase tracking-wider text-center shrink-0 min-w-[80px] transition-all cursor-pointer ${
            activeTab === "models"
              ? "bg-[#9945FF]/20 border border-[#9945FF]/40 text-white"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          🔑 Models & Specs
        </button>
        <button
          onClick={() => setActiveTab("prereq")}
          className={`flex-1 py-1.5 px-3 rounded-md text-[10px] font-bold uppercase tracking-wider text-center shrink-0 min-w-[80px] transition-all cursor-pointer ${
            activeTab === "prereq"
              ? "bg-[#9945FF]/20 border border-[#9945FF]/40 text-white"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          🛡️ Prerequisites
        </button>
        <button
          onClick={() => setActiveTab("tools")}
          className={`flex-1 py-1.5 px-3 rounded-md text-[10px] font-bold uppercase tracking-wider text-center shrink-0 min-w-[80px] transition-all cursor-pointer ${
            activeTab === "tools"
              ? "bg-[#9945FF]/20 border border-[#9945FF]/40 text-white"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          ⚙️ IDE & CLI Setup
        </button>
        <button
          onClick={() => setActiveTab("trouble")}
          className={`flex-1 py-1.5 px-3 rounded-md text-[10px] font-bold uppercase tracking-wider text-center shrink-0 min-w-[80px] transition-all cursor-pointer ${
            activeTab === "trouble"
              ? "bg-[#9945FF]/20 border border-[#9945FF]/40 text-white"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          ⚠️ Diagnostics / FAQ
        </button>
      </div>

      {/* Warning/Quote of Cypherpunk Lobster */}
      <div className="bg-[#9945FF]/5 border border-[#9945FF]/20 rounded-xl p-3 text-[10.5px] leading-relaxed mb-4 flex items-start gap-2.5">
        <ShieldAlert className="w-4.5 h-4.5 text-[#9945FF] shrink-0" />
        <div>
          <span className="text-white font-bold">CYPHERPUNK LOBSTER MANIFESTO:</span>{" "}
          <span className="italic text-zinc-400">
            "Privacy is necessary for an open society in the electronic age. Lobsters don't die of natural biological aging—they just keep growing stronger Armor under the pressure of the sea. Dark DeFi protocols must be built the exact same way. Protected, absolute, and encrypted."
          </span>
        </div>
      </div>

      {/* Tab: Models & Specs */}
      {activeTab === "models" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-xs font-black uppercase text-white flex items-center gap-1.5 tracking-wider border-b border-zinc-800 pb-1">
              <span className="w-1.5 h-1.5 bg-[#9945FF] rounded-full" />
              <span>Language Models (Text/Reasoning/Code)</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {modelSpecs.language.map((m, i) => (
                <div key={i} className="p-3 bg-zinc-950/40 border border-zinc-800 rounded-xl hover:border-[#9945FF]/40 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-xs font-black text-[#9945FF] tracking-wide">{m.name}</span>
                      <span className="text-[8px] uppercase tracking-widest text-zinc-500 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded font-mono">{m.type}</span>
                    </div>
                    <p className="text-[10px] text-zinc-400 mt-2 font-normal leading-normal">{m.desc}</p>
                  </div>
                  <div className="text-[9px] text-[#14F195] mt-3 font-semibold font-mono flex items-center gap-1">
                    <span className="text-zinc-600 select-none">&gt;&gt;</span>
                    <span>{m.features}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-black uppercase text-white flex items-center gap-1.5 tracking-wider border-b border-zinc-800 pb-1">
              <span className="w-1.5 h-1.5 bg-[#9945FF] rounded-full" />
              <span>SOTA Video Generation Models</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {modelSpecs.video.map((m, i) => (
                <div key={i} className="p-3 bg-zinc-950/40 border border-zinc-800 rounded-xl flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-black text-rose-400 tracking-wide">{m.name}</span>
                    <p className="text-[10px] text-zinc-400 mt-1 font-normal leading-normal">{m.desc}</p>
                  </div>
                  <div className="text-[9px] text-[#14F195] mt-2 font-semibold">
                    <span>Target: {m.features}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-black uppercase text-white flex items-center gap-1.5 tracking-wider border-b border-zinc-800 pb-1">
              <span className="w-1.5 h-1.5 bg-[#9945FF] rounded-full" />
              <span>High Fidelity Vocal Audio & Music Systems</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {modelSpecs.audioMusic.map((m, i) => (
                <div key={i} className="p-3 bg-zinc-950/40 border border-zinc-800 rounded-xl flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-black text-amber-400 tracking-wide">{m.name}</span>
                    <p className="text-[10px] text-zinc-400 mt-1 leading-normal font-light">{m.desc}</p>
                  </div>
                  <div className="text-[9px] text-[#14F195] mt-2 font-mono">
                    <span>{m.features}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Prerequisites */}
      {activeTab === "prereq" && (
        <div className="space-y-4">
          <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-4">
            <div className="space-y-1">
              <h4 className="text-xs font-black uppercase text-[#9945FF] tracking-wide">1. ACCOUNT ONBOARDING</h4>
              <p className="text-[11px] text-zinc-400 leading-relaxed font-light">
                Secure an active subscription profile by visiting the <a href="https://platform.minimax.io/login" target="_blank" rel="noopener noreferrer" className="text-sky-400 underline hover:text-[#14F195]">MiniMax API Console</a>. Complete login parameters to register.
              </p>
            </div>

            <div className="space-y-1 pt-2 border-t border-zinc-900">
              <h4 className="text-xs font-black uppercase text-[#9945FF] tracking-wide">2. OBTAIN CYPHER KEYS</h4>
              <p className="text-[11px] text-zinc-400 leading-relaxed font-light">
                Choose your key mechanism:
              </p>
              <ul className="list-disc pl-4 space-y-1 text-[11px] text-zinc-400 pt-1 font-light">
                <li><strong className="text-zinc-200">Pay-as-you-go Plan</strong>: Generates keys at the direct profile interface. Supports code generation pipelines, text-to-music, and audio.</li>
                <li><strong className="text-zinc-200">Token Plan Seats</strong>: Subscriptions allocation assigned to enterprise workspace clusters.</li>
              </ul>
            </div>

            <div className="space-y-2 pt-3 border-t border-zinc-900">
              <h4 className="text-xs font-black text-[#9945FF] uppercase tracking-wide">3. SHELL ENVIRONMENT EXPORTS</h4>
              <p className="text-[10px] text-zinc-500">Add Anthropic-API compatible headers directly into your local Linux or Mac profile terminal:</p>
              
              <div className="relative">
                <pre className="text-[11px] bg-black border border-zinc-800 rounded-lg p-3 text-emerald-400 overflow-x-auto leading-relaxed">
{`# Compatible Anthropic API (Recommended Endpoint Layer)
export ANTHROPIC_BASE_URL=https://api.minimax.io/anthropic
export ANTHROPIC_API_KEY=\${YOUR_MINIMAX_API_KEY}`}
                </pre>
                <button
                  onClick={() => triggerCopy(`export ANTHROPIC_BASE_URL=https://api.minimax.io/anthropic\nexport ANTHROPIC_API_KEY=\${YOUR_MINIMAX_API_KEY}`, "env-export")}
                  className="absolute right-2 top-2 bg-zinc-900 hover:bg-[#9945FF]/20 hover:border-[#9945FF]/30 border border-zinc-800 rounded-md p-1.5 transition-colors cursor-pointer"
                >
                  {copiedText === "env-export" ? <Check className="w-3.5 h-3.5 text-[#14F195]" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Tools Setup */}
      {activeTab === "tools" && (
        <div className="space-y-3">
          <div className="flex flex-col md:flex-row gap-4">
            {/* LHS: Tools select sidebar */}
            <div className="w-full md:w-56 shrink-0 space-y-1.5">
              <span className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider">Select IDE / Code Tool</span>
              {integrations.map((tool) => (
                <button
                  key={tool.id}
                  onClick={() => setExpandedSection(tool.id)}
                  className={`w-full text-left py-2 px-3 text-[10.5px] font-bold rounded-lg transition-all flex items-center justify-between border cursor-pointer ${
                    expandedSection === tool.id
                      ? "bg-[#9945FF]/10 border-[#9945FF]/40 text-white"
                      : "bg-zinc-950 border-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                  }`}
                >
                  <span>{tool.title.split(" ")[0]}</span>
                  <ChevronRight className={`w-3.5 h-3.5 text-[#9945FF]/60 transition-transform ${expandedSection === tool.id ? "rotate-90 text-[#9945FF]" : ""}`} />
                </button>
              ))}
            </div>

            {/* RHS: Interactive manual view */}
            <div className="flex-1 p-4 bg-zinc-950 border border-zinc-800 rounded-xl min-h-[300px] flex flex-col justify-between">
              {(() => {
                const specDef = integrations.find((x) => x.id === expandedSection);
                if (!specDef) return <p className="text-xs text-zinc-500">Pick an integration target.</p>;
                return (
                  <div className="space-y-4 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-black uppercase text-white flex items-center gap-1.5 border-b border-zinc-900 pb-1 tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#9945FF]" />
                        <span>{specDef.title}</span>
                      </h4>
                      <p className="text-[11px] text-zinc-400 mt-2 font-normal leading-relaxed">{specDef.desc}</p>

                      {specDef.steps && (
                        <div className="mt-3.5 space-y-2">
                          <span className="text-[9px] uppercase font-bold text-[#9945FF]/75 tracking-wider">Manual Instructions</span>
                          <ol className="list-decimal pl-4.5 space-y-1.5 text-[10.5px] text-zinc-300 font-light">
                            {specDef.steps.map((st, i) => (
                              <li key={i} className="leading-relaxed">{st}</li>
                            ))}
                          </ol>
                        </div>
                      )}

                      {specDef.code && (
                        <div className="relative mt-3.5">
                          <pre className="text-[10px] bg-black border border-zinc-900 rounded-lg p-3 text-[#14F195] overflow-x-auto leading-relaxed">
                            {specDef.code}
                          </pre>
                          <button
                            onClick={() => triggerCopy(specDef.code || "", specDef.id)}
                            className="absolute right-2 top-2 bg-zinc-900 border border-zinc-800 p-1.5 rounded hover:bg-[#9945FF]/20 transition-colors"
                          >
                            {copiedText === specDef.id ? <Check className="w-3.5 h-3.5 text-[#14F195]" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
                          </button>
                        </div>
                      )}
                    </div>

                    {specDef.verify && (
                      <div className="p-2.5 bg-emerald-900/5 border border-emerald-500/20 text-[#14F195] text-[10px] rounded-lg mt-4 font-mono">
                        <span className="font-bold uppercase tracking-wider block mb-1">Verify Calibration</span>
                        {specDef.verify}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Troubleshooting */}
      {activeTab === "trouble" && (
        <div className="space-y-4">
          <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3">
            <h4 className="text-xs font-black text-[#9945FF] uppercase tracking-wide">SOLVING UNEXPECTED API MAP FAILURE</h4>
            <pre className="text-[10px] bg-black border border-zinc-900 p-2 text-rose-450 rounded-lg">
              API Error: Cannot read properties of undefined (reading 'map')
            </pre>
            <p className="text-[11px] text-zinc-400 leading-relaxed font-light">
              This typical error arises when your workspace parameters or API URLs cross network regions incorrectly. Conduct the following direct checks:
            </p>
            <ol className="list-decimal pl-4.5 space-y-2 text-[10.5px] text-zinc-300 font-light">
              <li>
                <strong className="text-white">Verify physical credentials platform URL</strong>: Ensure your Base URL points exactly to <code className="text-[#9945FF]">https://api.minimax.io</code> for standard international targets, or <code className="text-[#9945FF]">https://api.minimaxi.com</code> inside regional network corridors.
              </li>
              <li>
                <strong className="text-white">Remove background environment variable conflicts</strong>: When testing frameworks like Claude Code locally, the terminal might try applying stale default authorization strings. Direct your terminal to clean variables using: <code className="text-emerald-400">unset ANTHROPIC_AUTH_TOKEN</code>.
              </li>
              <li>
                <strong className="text-white">Verify Model Identifier</strong>: Custom configurations must write out the target literal string <code className="text-emerald-400">"MiniMax-M3"</code> exactly (including capitalized letters and dashes).
              </li>
            </ol>
            <p className="text-[11px] text-zinc-500 pt-1 leading-normal">
              For security, direct inquiries can be routed to the primary API platform engineers at <code className="text-[#14F195] bg-zinc-900 px-1 py-0.5 rounded">api@minimax.io</code>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
