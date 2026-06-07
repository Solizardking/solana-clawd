<!-- ╔══════════════════════════════════════════════════════════════════════════╗ -->
<!-- ║   OpenClawd Skills  ·  x402.wtf/skills  ·  x402.wtf/skills      ║ -->
<!-- ║   130+ installable agent skill packs                                    ║ -->
<!-- ╚══════════════════════════════════════════════════════════════════════════╝ -->

<div align="center">

```
  ╔═══════════════════════════════════════════════════════════════════╗
  ║   O P E N C L A W D   S K I L L S   C A T A L O G               ║
  ║   140+ installable agent skill packs                             ║
  ╠═══════════════════════════════════════════════════════════════════╣
  ║                                                                   ║
  ║  🦀 Perps          vulcan (18) · imperial (11)                   ║
  ║  💸 DeFi           dflow (8) · pump.fun (20+) · solana (6)       ║
  ║  🛠  Dev Tools      github · tmux · oracle · skill-creator        ║
  ║  🎙 Media/AI       whisper · tts · image-gen · video · voice     ║
  ║  💬 Messaging      slack · discord · imsg · himalaya · wacli     ║
  ║  📝 Productivity   notion · obsidian · bear · apple-notes        ║
  ║  🔧 Utilities      1password · gemini · peekaboo · eightctl      ║
  ║                                                                   ║
  ╚═══════════════════════════════════════════════════════════════════╝
```

[![Skills](https://img.shields.io/badge/x402.wtf/skills-catalog-9B59B6?style=flat-square)](https://x402.wtf/skills)
[![x402 Skills](https://img.shields.io/badge/x402.wtf/skills-marketplace-1E5AA8?style=flat-square)](https://x402.wtf/skills)
[![Website](https://img.shields.io/badge/x402.wtf-147D64?style=flat-square)](https://x402.wtf)
[![x402](https://img.shields.io/badge/x402.wtf-1E5AA8?style=flat-square)](https://x402.wtf)

</div>

---

## What Is a Skill?

Each skill is a directory with a `SKILL.md` — a structured prompt that gives a Clawd agent the tools, context, and commands for a specific capability. Skills are modular: install one or dozens. The clawd TUI and Leviathan runtime load them automatically at spawn.

```
skills/my-skill/
└── SKILL.md     trigger phrases · tools · usage patterns · examples
```

```bash
clawd skill install <skill-name>   # install from catalog
clawd skill list                   # show installed skills
clawd skill search "perps"         # search by keyword
```

Browse the full catalog: **[x402.wtf/skills](https://x402.wtf/skills)** · **[x402.wtf/skills](https://x402.wtf/skills)**

---

## 🦀 Perps — Vulcan Pack (18 skills)

Full perpetuals trading stack for Phoenix/Vulcan. **Always load `vulcan` first** — it is the runtime contract, safety gate, and live-launch preflight for all other vulcan-* skills.

```
╔══════════════════════════════════════════════════════════════════════════╗
║  V U L C A N   P E R P S   S K I L L   P A C K                         ║
╠═════════════════════════════╦════════════════════════════════════════════╣
║  ENTRY POINT                ║                                            ║
║  vulcan                     ║  LOAD FIRST — contract · safety · preflight║
║  vulcan-quickstart          ║  5-minute onboarding path                  ║
║  vulcan-onboarding          ║  full setup walkthrough                    ║
╠═════════════════════════════╬════════════════════════════════════════════╣
║  EXECUTION                  ║                                            ║
║  vulcan-trade-execution     ║  market / limit / IOC orders               ║
║  vulcan-execution-modes     ║  paper · dry-run · confirm · auto          ║
║  vulcan-twap-execution      ║  time-weighted avg price splitting         ║
║  vulcan-grid-trading        ║  grid strategy + auto rebalance            ║
╠═════════════════════════════╬════════════════════════════════════════════╣
║  INTELLIGENCE               ║                                            ║
║  vulcan-market-intel        ║  OI · funding · mark price · basis         ║
║  vulcan-technical-analysis  ║  TA indicators + chart pattern recognition ║
║  vulcan-ta-strategy         ║  strategy builder from TA signals          ║
║  vulcan-portfolio-intel     ║  position summary · P&L · exposure         ║
╠═════════════════════════════╬════════════════════════════════════════════╣
║  RISK & OPS                 ║                                            ║
║  vulcan-risk-management     ║  max drawdown · position sizing · kill     ║
║  vulcan-lot-size-calculator ║  position sizing math + Kelly criterion    ║
║  vulcan-margin-operations   ║  deposit · withdraw · cross/isolated       ║
║  vulcan-position-management ║  open · close · flip · scale               ║
║  vulcan-tpsl-management     ║  TP/SL · trailing stop · bracket orders    ║
║  vulcan-error-recovery      ║  failed tx · stuck position · reconnect    ║
╚═════════════════════════════╩════════════════════════════════════════════╝
```

---

## 🏛 Perps — Imperial Pack (11 skills)

Phoenix/Imperial CLOB perps routing. **Always load `imperial` first.**

```
╔══════════════════════════════════════════════════════════════════════════╗
║  I M P E R I A L   P E R P S   S K I L L   P A C K                     ║
╠═════════════════════════════╦════════════════════════════════════════════╣
║  imperial                   ║  LOAD FIRST — routing · safety rules       ║
╠═════════════════════════════╬════════════════════════════════════════════╣
║  imperial-trade-execution   ║  Phoenix CLOB order placement              ║
║  imperial-execution-modes   ║  execution strategy selection              ║
║  imperial-twap-execution    ║  TWAP order splitting                      ║
║  imperial-grid-trading      ║  grid strategy on Phoenix                  ║
║  imperial-market-intel      ║  market depth · OI · funding rate          ║
║  imperial-portfolio-intel   ║  portfolio overview + analytics            ║
║  imperial-risk-management   ║  risk gates + position sizing rules        ║
║  imperial-margin-operations ║  margin deposit + withdrawal               ║
║  imperial-position-management ║  position open / close / scale           ║
║  imperial-tpsl-management   ║  take profit + stop loss management        ║
╚═════════════════════════════╩════════════════════════════════════════════╝
```

---

## 💸 DeFi — DFlow Pack (8 skills)

DFlow spot trading, Kalshi prediction markets, and Phantom wallet.

| Skill | Purpose |
| --- | --- |
| `dflow-spot-trading` | DFlow spot order routing |
| `dflow-kalshi-trading` | Kalshi prediction market trading |
| `dflow-kalshi-market-data` | Kalshi market data + prices |
| `dflow-kalshi-market-scanner` | scan + filter Kalshi markets |
| `dflow-kalshi-portfolio` | Kalshi position management |
| `dflow-phantom-connect` | Phantom wallet connection |
| `dflow-platform-fees` | DFlow fee calculation |
| `dflow-proof-kyc` | DFlow KYC proof generation |

Also: `dflow-docs` (protocol docs), `dflow-phantom-connect-skill` (alt variant), `dflow-skills` (pack index)

---

## 🎰 DeFi — pump.fun Pack (23 skills)

Complete pump.fun ecosystem coverage from bonding curves to admin ops.

```
pump.fun skills/
├── pumpfun                 core pump.fun interaction
├── pumpfun-trading         buy/sell on bonding curve
├── pumpfun-analytics       token analytics + volume tracking
├── pumpfun-fees            fee structure + calculation
├── pumpfun-launcher        token launch automation
├── pump-mcp-server         pump.fun MCP tools
├── pump-bonding-curve      AMM math + graduation prediction
├── pump-fee-sharing        fee sharing with partner configs
├── pump-fee-system         fee system architecture
├── pump-sdk-core           pump.fun TypeScript SDK usage
├── pump-solana-dev         Solana dev patterns for pump.fun
├── pump-solana-wallet      wallet operations for pump.fun
├── pump-solana-architecture  on-chain architecture overview
├── pump-ai-agents          AI agent patterns for pump.fun
├── pump-token-lifecycle    token lifecycle management
├── pump-token-incentives   incentive design patterns
├── pump-admin-ops          admin operations + governance
├── pump-security           security patterns + auditing
├── pump-build-release      build + release workflow
├── pump-testing            test patterns + fixtures
├── pump-shell-scripts      shell automation helpers
├── pump-rust-vanity        Rust vanity address generation
└── pump-ts-vanity          TypeScript vanity address tools
```

---

## 🪙 Solana DeFi Pack

| Skill | Purpose | Link |
| --- | --- | --- |
| `solana-clawd` | Solana Clawd core skill | [x402.wtf](https://x402.wtf) |
| `solana-clawd-agentic-commerce` | x402 commerce + payment flows | [x402.wtf](https://x402.wtf) |
| `solana-dev-skill-main` | end-to-end Solana dev (Jan 2026) | — |
| `solana-formal-verification` | Solana program formal verification | — |
| `dex-screener-scanner` | DexScreener token scanning | — |
| `phantom-wallet-mcp` | Phantom wallet MCP integration | — |
| `clawdex` | ClawdEx DEX persona | — |
| `gateway-node-ops` | x402 gateway node ops | [x402.wtf/gateway](https://x402.wtf/gateway) |
| `swarm-orchestrator` | multi-agent swarm coordination | — |
| `percolator-bounty` | bounty routing + payout automation | — |
| `ore-master 2` | ORE v3 mining agent | — |
| `model-usage` | model cost + usage tracking | — |

---

## 🛠 Dev Tools (9 skills)

| Skill | Purpose |
| --- | --- |
| `github` | `gh` CLI — issues · PRs · CI runs · releases |
| `tmux` | remote-control tmux: send keystrokes, scrape pane output |
| `oracle` | one-shot model consultation (prompt + file bundling) |
| `skill-creator` | design + package new AgentSkills with guided authoring |
| `openclaw-claude-code-skill-main` | Claude Code control via MCP protocol |
| `mcporter` | list, configure, auth, call MCP servers directly |
| `session-logs` | search + analyze prior session logs with jq |
| `clawdhub` | ClawdHub CLI — search, install, update, publish skills |
| `coding-agent` | general coding agent patterns + best practices |

---

## 🎙 Media & AI (15 skills)

| Skill | Purpose |
| --- | --- |
| `openai-whisper` | OpenAI Whisper STT (local binary) |
| `openai-whisper-api` | Whisper API audio transcription |
| `openai-image-gen` | DALL-E image generation |
| `sherpa-onnx-tts` | offline TTS via Sherpa ONNX (no API cost) |
| `voice-call` | voice call integration |
| `video-frames` | video frame extraction + visual analysis |
| `camsnap` | camera snapshot capture |
| `gifgrep` | GIF search + frame extraction |
| `canvas` | canvas/drawing integration |
| `gemini` | Google Gemini API |
| `gemini-antigravity` | Gemini Antigravity — isolated Linux sandbox (Python/Node, 4-CPU/16GB) |
| `gemini-deep-research` | Gemini Deep Research — autonomous multi-step web research with citations |
| `nano-banana` | Nano Banana 2 — Gemini 3.1 Flash image gen, 4K, grounding, video-to-image |
| `nano-banana-pro` | Nano Banana Pro — Gemini 3 Pro image generation + editing |
| `veo-video` | Veo 3.1 — cinematic 8-sec video with native audio, up to 4K |
| `sag` | short-form audio generation |
| `nano-pdf` | PDF extraction + parsing |
| `summarize` | document summarization |
| `songsee` | song recognition (Shazam-style) |

---

## 💬 Messaging & Communication (8 skills)

| Skill | Purpose |
| --- | --- |
| `slack` | Slack workspace operations + message sending |
| `discord` | Discord bot + guild management |
| `bluebubbles` | BlueBubbles iMessage bridge |
| `imsg` | iMessage via macOS scripting |
| `himalaya` | email CLI (IMAP/SMTP) |
| `wacli` | WhatsApp CLI |
| `bird` | Twitter/X client operations |
| `blogwatcher` | blog monitoring + content alerts |

---

## 📝 Productivity & Notes (8 skills)

| Skill | Purpose |
| --- | --- |
| `notion` | Notion pages + database operations |
| `obsidian` | Obsidian vault read/write |
| `bear-notes` | Bear note-taking app integration |
| `apple-notes` | Apple Notes via AppleScript |
| `apple-reminders` | Apple Reminders management |
| `things-mac` | Things 3 task manager |
| `trello` | Trello board + card operations |
| `gog` | GOG task + game orchestration |

---

## 🎵 Audio & Entertainment (4 skills)

| Skill | Purpose |
| --- | --- |
| `spotify-player` | Spotify playback control |
| `sonoscli` | Sonos speaker control |
| `blucli` | Bluetooth device management |
| `openhue` | Philips Hue smart lighting |

---

## 🌐 Local & Web Services (5 skills)

| Skill | Purpose |
| --- | --- |
| `food-order` | food ordering automation |
| `ordercli` | general order CLI |
| `goplaces` | Google Places search |
| `local-places` | local business discovery |
| `weather` | weather data + forecasts |

---

## 🔧 Utilities & System (6 skills)

| Skill | Purpose |
| --- | --- |
| `1password` | 1Password CLI secrets access |
| `eightctl` | 8bit system control CLI |
| `peekaboo` | macOS screen capture + visual analysis |
| `sponge-wallet` | sponge wallet operations |
| `model-usage` | model cost + token usage tracking |
| `UltraThink-SKill` | deep reasoning + ultra-thinking patterns |
| `agent-auth` | Solana agent identity — SIWS, CAAP attestation, TEE, CLAWD token gates |
| `pay` | user-authorized paid API access via x402/HTTP 402 (search, scrape, AI, and more) |

---

## Full Index at a Glance

```
╔══════════════════════════════════════════════════════════════════════════╗
║  140+ SKILLS  ·  x402.wtf/skills  ·  x402.wtf/skills             ║
╠════════════════════════╦═════════════════════════════════════════════════╣
║  PERPS (29)            ║  vulcan × 18  ·  imperial × 11                 ║
╠════════════════════════╬═════════════════════════════════════════════════╣
║  DEFI (42)             ║  dflow × 8  ·  pump.fun × 23  ·  solana × 6+  ║
║                        ║  phantom-wallet-mcp · clawdex · ore-master     ║
║                        ║  gateway-node-ops · swarm-orchestrator          ║
╠════════════════════════╬═════════════════════════════════════════════════╣
║  DEV TOOLS (9)         ║  github · tmux · oracle · skill-creator        ║
║                        ║  mcporter · claude-code · clawdhub · session   ║
╠════════════════════════╬═════════════════════════════════════════════════╣
║  MEDIA/AI (20)         ║  whisper × 2 · image-gen · tts · voice        ║
║                        ║  gemini × 3 · veo-video · nano-banana × 2     ║
║                        ║  video-frames · camsnap · gifgrep · nano-pdf   ║
╠════════════════════════╬═════════════════════════════════════════════════╣
║  MESSAGING (8)         ║  slack · discord · imsg · himalaya · wacli    ║
╠════════════════════════╬═════════════════════════════════════════════════╣
║  PRODUCTIVITY (8)      ║  notion · obsidian · bear · apple × 2 · trello║
╠════════════════════════╬═════════════════════════════════════════════════╣
║  AUDIO/ENT (4)         ║  spotify · sonoscli · blucli · openhue        ║
╠════════════════════════╬═════════════════════════════════════════════════╣
║  LOCAL/WEB (5)         ║  food-order · ordercli · goplaces · weather   ║
╠════════════════════════╬═════════════════════════════════════════════════╣
║  UTILITIES (8)         ║  1password · eightctl · peekaboo · UltraThink ║
║                        ║  agent-auth · pay                              ║
╚════════════════════════╩═════════════════════════════════════════════════╝
```

---

## Adding a New Skill

```bash
# Guided creation via the skill-creator skill
clawd skill create my-skill

# Or manually:
mkdir skills/my-skill
cat > skills/my-skill/SKILL.md << 'EOF'
---
name: my-skill
description: One-line summary of what this skill does
triggers:
  - "when user asks about X"
  - "when user wants to Y"
tools:
  - bash
  - read
examples:
  - "do X thing"
  - "set up Y workflow"
---

## My Skill

[full skill instructions here]
EOF
```

Publish to the catalog: **[x402.wtf/skills](https://x402.wtf/skills)** · **[x402.wtf/skills](https://x402.wtf/skills)**

---

<div align="center">

```
  ╔═════════════════════════════════════════════════════════════════╗
  ║  🦞  The shell molts. The skills compound.                     ║
  ║      x402.wtf/skills  ·  x402.wtf/skills  ·  MIT       ║
  ╚═════════════════════════════════════════════════════════════════╝
```

*[x402.wtf](https://x402.wtf) · [x402.wtf](https://x402.wtf) · [github.com/solizardking/solana-clawd](https://github.com/solizardking/solana-clawd)*

</div>
