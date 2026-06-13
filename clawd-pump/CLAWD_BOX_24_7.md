# Clawd Pump 24/7 Box Setup

This agent is live financial software. Use a dedicated hot wallet with limited SOL only. Do not use a primary wallet or seed phrase. Funding and live arming must be done by the operator.

## Safety Gates

Live actions are blocked unless both are set:

```bash
LIVE_TRADING_ENABLED=true
PUMP_DRY_RUN=false
```

Keep the default safe values during setup:

```bash
LIVE_TRADING_ENABLED=false
PUMP_DRY_RUN=true
```

The code also enforces `MAX_TRADE_SOL` for direct buys, launch dev buys, and autobuy mode.

## One-Time Setup

1. Build and validate:

```bash
cargo check
cargo build --release
./scripts/smoke_live_gates.sh
```

2. Create a dedicated hot wallet outside this repo using Solana tooling, then fund it with only the amount you are prepared to lose.

To display the funding address derived from the local `.env` without printing the private key:

```bash
./scripts/funding_address.sh
```

To also query SOL balance through `RPC_HTTP`:

```bash
./scripts/funding_address.sh --with-balance
```

or from the repo root:

```bash
npm run pump:wallet
```

3. Configure `.env` from `.env.example`.

Required live keys:

```bash
RPC_HTTP=https://...
YELLOWSTONE_GRPC_HTTP=https://...
YELLOWSTONE_GRPC_TOKEN=
PRIVATE_KEY=<dedicated hot-wallet base58 private key>
LIVE_TRADING_ENABLED=false
PUMP_DRY_RUN=true
MAX_TRADE_SOL=0.01
AUTO_BUY_AMOUNT_SOL=0.01
COUNTER_LIMIT=10
RISK_MANAGEMENT_ENABLED=true
```

4. Run preflight. It checks presence and limits without printing secret values:

```bash
./scripts/preflight.sh
./scripts/preflight.sh serve
./scripts/preflight.sh autobuy
```

`copy` mode requires `YELLOWSTONE_GRPC_HTTP`; `serve` and `autobuy` modes do not.

5. Only after preflight passes and you intentionally accept live trading risk, arm live mode:

```bash
./scripts/arm_live.sh
```

Then rerun:

```bash
./scripts/preflight.sh
```

## 24/7 Run Modes

Copy-trading loop:

```bash
./scripts/run_24_7.sh copy
```

Autobuy loop:

```bash
./scripts/run_24_7.sh autobuy
```

HTTP control server:

```bash
./scripts/run_24_7.sh serve
```

Root package shortcuts:

```bash
npm run pump:preflight
npm run pump:doctor
npm run pump:readiness
npm run pump:status
npm run pump:control -- status
npm run pump:safe-defaults
npm run pump:smoke
npm run pump:wallet
npm run pump:wallet:funding
npm run pump:arm
npm run pump:disarm
npm run pump:service:systemd
npm run pump:service:launchd
npm run pump:service:install:systemd
npm run pump:service:install:launchd
npm run pump:24x7
npm run pump:24x7:autobuy
npm run pump:serve
```

Status check:

```bash
./scripts/status.sh
```

Runtime control file:

```bash
./scripts/bot_control.sh status
./scripts/bot_control.sh pause
./scripts/bot_control.sh resume
./scripts/bot_control.sh volume 0.005 10 5 60
```

Full read-only readiness report:

```bash
./scripts/doctor_24_7.sh
./scripts/doctor_24_7.sh serve
./scripts/doctor_24_7.sh autobuy
```

Machine-readable readiness report for a box supervisor or external monitor:

```bash
./scripts/readiness_json.sh
./scripts/readiness_json.sh serve
./scripts/readiness_json.sh autobuy
```

The JSON report does not print private keys. For `copy` and `autobuy`, `ready_to_start` is only `true` when live preflight, funding verification, gate smoke checks, and service rendering all pass. For `serve`, it proves the HTTP health/control server can start safely while trade endpoints remain blocked unless live gates are intentionally armed.

Funding verification:

```bash
./scripts/wallet_balance_check.sh
```

The funding check uses the public funding address and JSON-RPC balance calls. It requires enough SOL for `MIN_RESERVE_SOL` plus the larger of `MAX_TRADE_SOL` and `AUTO_BUY_AMOUNT_SOL`.

## Box Service Install

Linux systemd template:

```bash
./scripts/service_control.sh install systemd copy
```

That prints the commands it would run. To actually install and enable the service without starting it:

```bash
./scripts/service_control.sh install systemd copy --apply
```

macOS launchd template:

```bash
./scripts/service_control.sh install launchd copy
```

That prints the commands it would run. To actually install the service without starting it:

```bash
./scripts/service_control.sh install launchd copy --apply
```

Both service templates call `scripts/run_24_7.sh`, which runs preflight before starting the trading process. The service control helper does not start the service; start it only after `./scripts/preflight.sh` passes.

## Upstash Box Agent

The repo also exposes a Clawd box adapter from the root package:

```bash
npm run box:pump -- --prompt "Inspect pump readiness and report blockers"
```

Preflight Box credentials and MCP wiring without printing secret values or creating a Box:

```bash
npm run box:pump:preflight -- --bootstrap-local-mcp
```

`BOX_KEY` is accepted as an alias for `UPSTASH_BOX_API_KEY`. If a Box key is present and no direct model key is set, the launcher uses Upstash-managed model auth by default.

Require both Box credentials and local live trading readiness:

```bash
npm run box:pump:preflight:live -- --bootstrap-local-mcp
npm run box:pump:preflight:live -- --bootstrap-local-mcp --mode serve
```

The strict preflight fails until `./scripts/readiness_json.sh <mode>` reports `ready_to_start=true`. For `serve` mode, `ready_to_start=true` means the HTTP health/control server can start while trade endpoints remain blocked by the live gates.

Model authentication can use either a direct model key:

```bash
CLAUDE_KEY=...
```

or an Upstash-managed key:

```bash
CLAWD_BOX_AGENT_API_KEY=UPSTASH_KEY
# or:
CLAWD_BOX_AGENT_API_KEY=STORED_KEY
```

Use an externally reachable MCP endpoint:

```bash
npm run box:pump -- --mcp-url https://your-mcp-host.example.com/mcp --keep-alive
```

Or bootstrap this repo's MCP server inside the Box:

```bash
npm run box:pump -- --bootstrap-local-mcp --keep-alive --no-delete
```

The Box launcher loads `.env`, `.env.local`, and `clawd-pump/.env` into an allowlist before creating the Box, so RPC/API keys can reach the MCP server without printing them. By default the box agent is observation/transaction-builder oriented and does not forward signing keys. Passing a private key into a remote box requires both:

```bash
--include-private-key
ALLOW_BOX_PRIVATE_KEY=true
```

Keep that disabled unless you intentionally want the remote box to have hot-wallet signing authority. The local `scripts/run_24_7.sh` path is the default for unattended live execution because it keeps signing local to this machine.

## Funding Policy

Fund only the dedicated hot wallet. Keep enough SOL reserved for rent and fees:

```bash
MIN_RESERVE_SOL=0.05
MAX_TRADE_SOL=0.01
AUTO_BUY_AMOUNT_SOL=0.01
COUNTER_LIMIT=10
```

Do not put more SOL in the hot wallet than the max loss you accept for unattended operation.

## Operations

- Logs are written under `logs/`.
- Active runner logs rotate when they reach `LOG_MAX_BYTES`, default `10485760`, and keep `LOG_KEEP_FILES`, default `5`, rotated files per mode.
- The runner restarts after process exit with a 10 second delay.
- `cargo check` must pass before each supervised start.
- `scripts/doctor_24_7.sh` runs the wallet, status, smoke, service render, and preflight checks without funding, arming, installing, or starting the bot.
- `scripts/readiness_json.sh` emits a machine-readable readiness summary for box supervisors without printing secret values. It requires funding verification for `ready_to_start=true`.
- `scripts/wallet_balance_check.sh` verifies the public hot-wallet SOL balance against `MIN_RESERVE_SOL` plus the largest configured single trade amount.
- `scripts/smoke_live_gates.sh` verifies unarmed live commands stop before wallet/RPC runtime initialization.
- HTTP trading endpoints are blocked while `PUMP_DRY_RUN=true` or `LIVE_TRADING_ENABLED` is not `true`.
- `scripts/status.sh` reports live gate state, process state, optional HTTP health, and recent log files without printing private keys.
- `scripts/bot_control.sh` writes the autobuy control file read by the running process. `pause` sets `mode=stopped`; `resume` returns to `normal`; `volume` sets burst parameters.
- `scripts/apply_safe_defaults.sh` fills non-secret 24/7 defaults while keeping live trading disarmed.
- `scripts/arm_live.sh` and `scripts/disarm_live.sh` only update non-secret live gate and risk-control keys, and create a timestamped `.env` backup before editing.

## Emergency Stop

Stop the process with your process manager, then close the live gate:

```bash
./scripts/disarm_live.sh
```

For token cleanup commands, keep the same live gate discipline; `--close`, `--wrap`, `--unwrap`, `--buy`, `--launch`, `--risk-check`, autobuy, and copy trading all require live arming.
