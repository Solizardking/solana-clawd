# Solana Box Agents

<div align="center">
  <img src="../assets/box-agents-banner.svg" alt="Box Agents animated banner" width="100%" />
</div>

`box/` is the workspace for sandboxed blockchain agents. Each run starts in an
isolated micro-VM, does one piece of work, and is torn down after the result is
captured. That keeps local keys, browser state, and other private data off the
agent surface.

## Why Box

- Isolated
- Ephemeral
- AI-native
- Cost-tracked
- Composable

## Eight Solana Lanes

| Agent | File | Purpose |
|---|---|---|
| Trading Agent | `agents/solana-trading-agent.ts` | Autonomous token analysis and swap signal generation |
| Perps Trading Agent | `agents/solana-perps-trading-agent.ts` | Paper-first perps planning with explicit live-preview gates |
| Memecoin Screener | `agents/solana-memecoin-screener.ts` | Scans DEX data for new listings, liquidity, and risk |
| Swarm Agent | `agents/solana-swarm-agent.ts` | Coordinates sub-agents and combines their outputs |
| Portfolio Manager | `agents/solana-portfolio-manager.ts` | Wallet analysis, diversification scoring, and rebalancing |
| On-Chain Analyst | `agents/solana-onchain-analyst.ts` | Wallet and contract forensics with severity-tagged findings |
| Arbitrage Scanner | `agents/solana-arbitrage-scanner.ts` | Cross-DEX price comparison and net-profit estimation |
| NFT Flipper | `agents/solana-nft-flipper.ts` | Floor analysis, collection scoring, and flip strategy support |

## Usage

### Run an agent

```bash
# Trading agent (analyze a specific token)
npx tsx agents/solana-trading-agent.ts <token-mint> <symbol>

# Perps planner (paper-first, no private keys in Box)
npx tsx scripts/perps-preflight.ts --symbol SOL --side long --notional 100 --execution paper
npx tsx scripts/solana-call-plan.ts SOL
npx tsx agents/solana-perps-trading-agent.ts --symbol SOL --side long --notional 100 --execution paper

# DeepSeek autonomous arena dialogue (server-side API key only)
DEEPSEEK_API_KEY=... HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=... \
  npm run arena:deepseek -- --rounds 3

# Memecoin screener (scan for opportunities)
npx tsx agents/solana-memecoin-screener.ts

# On-chain analyst (investigate a wallet or mint)
npx tsx agents/solana-onchain-analyst.ts <address>

# Portfolio manager
npx tsx agents/solana-portfolio-manager.ts <wallet-address>

# Arbitrage scanner
npx tsx agents/solana-arbitrage-scanner.ts
```

### Batch processing

```bash
npx tsx scripts/batch-processor.ts
```

### Cleanup

```bash
npx tsx scripts/cleanup-boxes.ts
```

## Box API Surface

Each agent uses the same sandbox primitives:

| API | Description |
|-----|-------------|
| `Box.create()` | Create a sandboxed agent runtime |
| `box.agent.run()` | Run the agent with a prompt and structured response |
| `box.agent.stream()` | Stream agent output in real time |
| `box.exec.command()` | Execute shell commands |
| `box.exec.code()` | Run code snippets inside the box |
| `box.files.write()` | Write files to the box filesystem |
| `box.files.read()` | Read files from the box |
| `box.files.upload/download()` | Transfer files in and out |
| `box.git.clone()` | Clone git repositories |
| `box.git.createPR()` | Create PRs from changes |
| `box.snapshot()` | Save workspace state |
| `box.delete()` | Destroy the box when the run is done |

## Cost Tracking

Every run returns cost data so you can meter token burn, compute time, and
provider spend without guessing.

## DeepSeek Autonomy

Set `DEEPSEEK_API_KEY` to let arena agents use DeepSeek through the
OpenAI-compatible endpoint at `https://api.deepseek.com`. The preferred model is
`deepseek-v4-pro`; use `DEEPSEEK_FAST_MODEL=deepseek-v4-flash` for cheaper
sub-agent turns. Claude Code-style integrations can point
`ANTHROPIC_BASE_URL` at `https://api.deepseek.com/anthropic` and use
`ANTHROPIC_AUTH_TOKEN` with the same DeepSeek key.

Use `HELIUS_RPC_URL` as the first-choice Solana read plane. `SOLANA_RPC_URL` and
`RPC_URL` remain fallbacks, but Box preflight and the DeepSeek arena script now
prefer Helius when configured.

## Install Tracking

Box and agent install tracking sends minimal metadata to `CLAWD_TRACKING_URL`,
defaulting to the public gateway endpoint at `/api/track/install`. Set
`CLAWD_DISABLE_TRACKING=true` to opt out. If your gateway requires a tracking
token, set `CLAWD_TRACKING_TOKEN` locally. Do not place Neon database URLs,
passwords, or Data API keys in Box prompts, docs, or committed files.

## Safety

- Boxes are ephemeral and should be destroyed after use
- Agents cannot access your local filesystem
- No trade execution without explicit confirmation
- Perps runs default to paper/simulation and only allow live-preview when
  `LIVE_TRADING=true`, `OPERATOR_CONFIRMED=true`, and `PERPS_SIM_ONLY=false`
- The perps Box creates an ephemeral in-sandbox agent wallet for simulation
  identity and reads from configured Solana RPC, Jupiter, Helius, and Phoenix.
  It does not forward private keys or submit signed live transactions.
- Snapshot before cleanup if you need to preserve state
- Use your own sandbox and model credentials locally; nothing private is
  committed in this workspace

## Reference

This workspace follows the public-safe Box manifesto summary used in the main
README. For the landing page, see [../README.md](../README.md).
