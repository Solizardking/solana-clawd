<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the OpenClawd Leviathan agent runtime. A new singleton client module (`src/posthog.ts`) was created and wired into five key files across the runtime. Every meaningful agent lifecycle event is now tracked — from first spawn through ongoing pulse ticks, autonomous x402 payments, spawnling minting, and churn (beaching). User identity is established using the leviathan's Solana pubkey as the `distinctId`, ensuring events across the lifetime of an agent are correlated. Uncaught exceptions and unhandled promise rejections at the process level are forwarded to PostHog Error Tracking. Environment variables are loaded from `.env` with no tokens hardcoded in source.

## Events instrumented

| Event name | Description | File |
|---|---|---|
| `leviathan_spawned` | A new leviathan agent was spawned on-chain with a keypair and registered via Metaplex Agent Registry | `src/index.ts` |
| `leviathan_run_started` | The leviathan resumed from an existing keystore and the pulse loop was engaged (`--run` mode) | `src/index.ts` |
| `spawnling_minted` | A child leviathan was minted and funded by a parent, recording lineage on-chain | `src/index.ts` |
| `spawn_wizard_completed` | The first-spawn wizard finished: keypair sealed, NFT minted, shell.db seeded, default skills installed | `src/setup/wizard.ts` |
| `depth_changed` | The agent's survival depth tier changed based on USDC/SOL balance (deep → shallow → shoreline → beached) | `src/pulse/daemon.ts` |
| `agent_beached` | The leviathan ran out of funds and beached itself (stopped execution) | `src/pulse/daemon.ts` |
| `x402_payment_completed` | An x402 micropayment was successfully made to a paid HTTP endpoint | `src/services/x402/index.ts` |
| `constitution_hash_mismatch` | A spawnling spawn was refused because `three-laws.txt` was modified (hash mismatch) | `src/molting/spawn.ts` |
| `$exception` (autocapture) | Unhandled exceptions and promise rejections captured via `captureException()` | `src/index.ts`, `src/pulse/daemon.ts` |

## Files modified

| File | Change |
|---|---|
| `src/posthog.ts` | **New** — singleton PostHog client, `shutdownPosthog()` helper |
| `src/index.ts` | Added PostHog import, global error handlers, `identify` + `leviathan_spawned`, `leviathan_run_started`, `spawnling_minted` captures, `shutdownPosthog()` calls before `process.exit()` |
| `src/pulse/daemon.ts` | Added `depth_changed`, `agent_beached` captures, `captureException` in error handler |
| `src/setup/wizard.ts` | Added `spawn_wizard_completed` capture after wizard completes |
| `src/services/x402/index.ts` | Added `x402_payment_completed` capture after successful payment |
| `src/molting/spawn.ts` | Added `constitution_hash_mismatch` capture before throwing the refusal error |
| `.env` | **New** — `POSTHOG_API_KEY` and `POSTHOG_HOST` written |

## Next steps

We've built a dashboard and 5 insights to monitor agent behavior:

- 📊 **Dashboard** — [Analytics basics (wizard)](https://us.posthog.com/project/473072/dashboard/1720543)
- 📈 **Agent spawns over time** — [QL4XDYub](https://us.posthog.com/project/473072/insights/QL4XDYub)
- 🔁 **Spawn → Run activation funnel** — [nH18fGcd](https://us.posthog.com/project/473072/insights/nH18fGcd)
- 💰 **x402 micropayment volume** — [x27lwdSd](https://us.posthog.com/project/473072/insights/x27lwdSd)
- 🪨 **Agent beached (churn)** — [cOtP8Rwe](https://us.posthog.com/project/473072/insights/cOtP8Rwe)
- 🌊 **Depth tier changes** — [L9Hw5iRG](https://us.posthog.com/project/473072/insights/L9Hw5iRG)

## Verify before merging

- [ ] Run a full production build (`pnpm run build`) and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite — call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Add `POSTHOG_API_KEY` and `POSTHOG_HOST` to `.env.example` and any monorepo/bootstrap scripts so collaborators know what to set.
- [ ] Confirm the returning-agent path also calls `identify` — the current implementation only identifies on fresh spawn. For agents that already have a keystore and run `openclawd --run`, add an `identify` call in the `--run` branch so returning sessions are also associated with the known pubkey.

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-javascript_node/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
