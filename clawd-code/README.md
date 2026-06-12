# Clawd Code

Curl-installable Solana-native AI coding CLI with local wallet creation and
paper-gated perpetuals workflows.

`clawd-code` is a headless command-line agent for generating TypeScript/Solana
code, checking perps market workflows, creating local Solana keypairs, and
running research/image/voice modes from one binary.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/Solizardking/solana-clawd/main/clawd-code/install.sh | sh
```

The installer checks for Node.js 18+, installs the `clawd-code` binary, and
creates `~/.clawd-code/.env` if one does not already exist.

Manual install:

```bash
git clone https://github.com/Solizardking/solana-clawd.git
cd solana-clawd/clawd-code
cp .env.example ~/.clawd-code/.env
npm install
npm run build
npm link
```

## Quick Start

```bash
clawd-code code "Build a Jupiter swap bot in TypeScript"
clawd-code wallet create
clawd-code wallet list
clawd-code perps
clawd-code funding
clawd-code trade "funding rate on SOL perps"
clawd-code research --agents 16 "Solana perps funding arb"
```

## Commands

| Command | Purpose |
| --- | --- |
| `clawd-code code "<prompt>"` | Generate TypeScript/Solana code |
| `clawd-code trade "<intent>"` | Run perps market, paper trade, and position workflows |
| `clawd-code wallet create [name]` | Create a local Solana keypair |
| `clawd-code wallet list` | List local wallet public keys |
| `clawd-code perps` | Show perps dashboard |
| `clawd-code funding` | Show funding-rate dashboard |
| `clawd-code research "<prompt>"` | Run multi-agent research |
| `clawd-code image "<prompt>"` | Generate images when configured |
| `clawd-code voice "<text>"` | Generate voice when configured |
| `clawd-code verify` | Run environment checks |

Slash aliases such as `clawd-code /wallet create` and `clawd-code /perps` still
work for compatibility.

## Configuration

Runtime configuration lives in `~/.clawd-code/.env`. Start from
[.env.example](./.env.example).

| Variable | Description | Default |
| --- | --- | --- |
| `CLAWD_PROVIDER` | AI provider: `xai`, `openrouter`, or `deepseek` | `xai` |
| `CLAWD_MODEL` | Model used by the selected provider | `grok-4.20-multi-agent` |
| `XAI_API_KEY` | xAI API key for Grok modes | empty |
| `DEEPSEEK_API_KEY` | DeepSeek API key | empty |
| `OPENROUTER_API_KEY` | OpenRouter API key | empty |
| `SOLANA_RPC_URL` | Solana RPC endpoint | mainnet-beta |
| `HELIUS_API_KEY` | Optional Helius key for RPC/DAS workflows | empty |
| `VULCAN_MCP_URL` | Vulcan MCP server URL | `http://localhost:3001` |
| `LIVE_TRADING` | Enables live trading path when true | `false` |
| `OPERATOR_CONFIRMED` | Required operator acknowledgement for live trading | `false` |
| `PERPS_SIM_ONLY` | Keeps perps execution simulated | `true` |

Never commit `.env`, wallet files, API keys, private keys, or generated outputs.
The repository ignore rules exclude `.env`, `.clawd/`, `node_modules/`,
`dist/`, and `outputs/`.

## Wallets

```bash
clawd-code wallet create
clawd-code wallet create trader-1
clawd-code wallet list
```

Wallets are stored as Solana CLI-compatible keypair JSON files under
`~/.clawd-code/wallets` with `0600` permissions. Treat those files like private
keys.

## Perps Safety

Perps workflows default to paper mode. Live trading requires all of these:

```bash
LIVE_TRADING=true
OPERATOR_CONFIRMED=true
PERPS_SIM_ONLY=false
```

The trade mode also applies local preflight constraints such as allowed symbols,
maximum notional, maximum leverage, and maximum spread. Review the code and your
configuration before enabling live execution.

## Development

```bash
npm install
npm run build
npm test
npm audit
npm pack --dry-run
```

Project layout:

```text
clawd-code/
├── install.sh
├── package.json
├── README.md
├── LICENSE
├── clawd.json
├── src/
│   ├── cli.ts
│   ├── commands.ts
│   ├── wallet.ts
│   └── modes/
└── tsconfig.json
```

## Release Contents

The npm package allowlist includes only:

- `dist/`
- `install.sh`
- `README.md`
- `LICENSE`
- `.env.example`
- `clawd.json`

Local runtime files and secrets are intentionally excluded.

## License

MIT. See [LICENSE](./LICENSE).
