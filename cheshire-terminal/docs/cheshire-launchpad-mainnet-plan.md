# Cheshire Launchpad Mainnet Plan

This is the first-party SDK and IDL plan for hosting Cheshire token launches, AI agent launches, and migration records on Solana mainnet.

## What Exists Now

- `server/routes/dbc-launch.ts` and `server/lib/dbc/index.ts` already build Meteora Dynamic Bonding Curve launch, swap, and DAMM v2 migration transactions.
- `server/routes/metaplex-agents.ts` already mints Metaplex Core agent assets and registers Agent Identity documents.
- `client/src/lib/staking/*` shows the current browser-side Anchor helper pattern.
- `shared/contracts/token-launcher.rs` should not be used as the production contract source. It declares the Pump.fun program id and mixes placeholder external verification logic into an on-chain program.
- `programs/token-launchpad` is an older Anchor scaffold with a localnet id and incomplete module wiring. Treat it as reference material, not the mainnet target.

## New Artifacts

- Canonical IDL: `shared/idl/cheshire_launchpad.json`
- TypeScript IDL export: `shared/cheshire-launchpad/idl.ts`
- TypeScript SDK: `shared/cheshire-launchpad/sdk.ts`
- Anchor program scaffold: `programs/cheshire-launchpad/src/lib.rs`

The new contract interface is intentionally a launch registry/control plane. It records:

- launchpad config and fee settings
- agent profiles linked to Metaplex Core assets
- token launch records
- optional bonding curve pool addresses
- launch kind: Pump, Meteora DBC, Jupiter RFQ, external, agent token, or p-token
- curve route: Pump-style synthetic reserves, Meteora DBC, constant product, linear, or external
- AMM route: PumpSwap, Meteora DAMM v2, Raydium CPMM, Jupiter, or external
- fee route: protocol, creator, agent, referral, or external settlement
- curve snapshots for SDK quoting and migration planning
- migration targets after graduation

Token minting, bonding curve execution, Jupiter swaps, Pump launches, and Metaplex agent minting should remain in their dedicated backends unless we deliberately move those flows into CPIs later. That keeps the first mainnet program smaller, cheaper, and easier to audit.

## SDK/IDL Surface

The first-party SDK now exposes builders for:

- `initialize_config`
- `set_config`
- `set_default_fee_profile`
- `create_agent_profile`
- `launch_token`
- `launch_managed_token`
- `attach_token_to_agent`
- `record_migration`
- `set_launch_phase`
- `set_pause`

Use `launch_managed_token` for production launches. It stores the complete route profile in the `LaunchRecord`:

- `LaunchKind.AgentToken` for agent-owned or agent-linked launches
- `LaunchKind.PToken` for Cheshire p-token launches
- `CurveRoute.PumpSynthetic` with `AmmRoute.PumpSwap` for Pump-inspired launches
- `CurveRoute.MeteoraDynamicBondingCurve` with `AmmRoute.MeteoraDammV2` for DBC launches
- `FeeRoute.ProtocolCreatorAgentReferral` when protocol, creator, agent, and referral splits are all active

The SDK includes planning presets:

- `PUMP_STYLE_CURVE_SNAPSHOT`
- `PUMP_STYLE_FEE_PROFILE`
- `CHESHIRE_AGENT_TOKEN_FEE_PROFILE`
- `CHESHIRE_P_TOKEN_FEE_PROFILE`

It also includes quote helpers:

- `quoteCurveBuyExactQuoteIn`
- `quoteCurveSellExactTokenIn`
- `totalSwapFeeBps`
- `estimateLaunchpadAccountRent`
- `estimateProgramDeploymentRent`

## Mainnet Program Strategy

1. Generate a real deploy keypair and replace the placeholder IDL address:

   ```bash
   solana-keygen new --outfile target/deploy/cheshire_launchpad-keypair.json
   solana-keygen pubkey target/deploy/cheshire_launchpad-keypair.json
   ```

2. Build the clean Anchor program scaffold from the new IDL contract surface:

   - `initialize_config`
   - `set_config`
   - `set_pause`
   - `create_agent_profile`
   - `launch_token`
   - `attach_token_to_agent`
   - `record_migration`

3. Keep the first version registry-only. It should not custody launch liquidity, own user funds, or perform DEX routing.

4. Use a multisig or hardware wallet as upgrade authority. Do not deploy with a hot server wallet as upgrade authority.

5. Run localnet and devnet tests with real flows:

   - mint/register an agent through `metaplex-agents`
   - launch a DBC token through `dbc-launch`
   - write the `AgentProfile`
   - write the `LaunchRecord`
   - attach token to agent
   - record migration after graduation

6. Only then deploy to mainnet.

## Cost Model

Solana program deploy cost is dominated by rent-exempt storage for the upgradeable `ProgramData` account. The Solana docs note that upgradeable deployments store bytecode in ProgramData and fund that account to rent exemption. The exact account rent should be queried with `getMinimumBalanceForRentExemption`.

Use the SDK estimator against mainnet:

```ts
import { Connection } from "@solana/web3.js";
import {
  MAINNET_PROGRAM_SIZE_ESTIMATES,
  estimateLaunchpadAccountRent,
  estimateProgramDeploymentRent,
} from "@shared/cheshire-launchpad";

const connection = new Connection(process.env.HELIUS_RPC_URL!, "confirmed");

console.log(await estimateLaunchpadAccountRent(connection));
console.log(
  await estimateProgramDeploymentRent(
    connection,
    MAINNET_PROGRAM_SIZE_ESTIMATES.registryWithCpiBytes
  )
);
```

Current rent checks from `solana --url https://api.mainnet-beta.solana.com rent` on May 15, 2026:

| Item | Bytes | SOL |
| --- | ---: | ---: |
| Config PDA | 94 | 0.00154512 |
| Launch record PDA | 284 | 0.00286752 |
| Agent profile PDA | 386 | 0.00357744 |
| Program account | 36 | 0.00114144 |
| ProgramData for 260 KB program | 260,045 | 1.81080408 |
| Temporary buffer for 260 KB program | 260,000 | 1.81049088 |
| ProgramData for 520 KB program | 520,045 | 3.62040408 |
| Temporary buffer for 520 KB program | 520,000 | 3.62009088 |
| ProgramData for 850 KB program | 850,045 | 5.91720408 |
| Temporary buffer for 850 KB program | 850,000 | 5.91689088 |

Deployment reserve including Program account, ProgramData, temporary buffer, and 0.05 SOL transaction padding:

| Program shape | SOL reserve | USD at SOL = $89.77 |
| --- | ---: | ---: |
| Registry/control plane, 260 KB | 3.67243640 | $329.67 |
| Registry plus CPI helpers, 520 KB | 7.29163640 | $654.57 |
| Larger router/control program, 850 KB | 11.88523640 | $1,066.94 |

The temporary buffer is generally closed by a successful deploy, but the deploy wallet still needs enough balance to front it. For mainnet, fund the deployer with at least 12 SOL for the first control-plane release, or 18 SOL if we decide to ship a larger CPI-heavy build.

Launch execution reserve:

| Flow | Planning Reserve |
| --- | ---: |
| Metaplex Core agent mint/register | 0.01 to 0.05 SOL per agent, plus RPC priority headroom |
| Cheshire managed launch record | 0.00286752 SOL rent per token launch |
| Agent profile record | 0.00357744 SOL rent per agent profile |
| DBC token launch record and token setup | 0.03 to 0.12 SOL excluding creator liquidity |
| Pump-style token creation | about 0.02 SOL plus any initial buy/liquidity |
| Raydium-style pool after graduation | 2 to 3 SOL pool creation reserve plus liquidity |

## App Hosting For 1,000 DAU

The app should be sized for steady realtime usage rather than cold starts:

- Fly: keep `min_machines_running = 1`, `auto_stop_machines = "off"`, and request at least `shared-cpu-2x` with 2 GB RAM.
- Start with 2 machines for production availability if Discord/Telegram relays and websockets are business critical.
- Convex: usage/profile/agent reads are already subscription-friendly; keep hot writes batched or summarized into daily rows.
- RPC: use a paid Helius or equivalent mainnet RPC. Public RPC is not sufficient for launches, migrations, or 1,000 DAU realtime token screens.

Current Fly public pricing lists `shared-cpu-2x` 2 GB at about $11.83/month per always-on machine before bandwidth, volumes, and support. Two app machines are therefore roughly $24/month compute before outbound data, Convex, RPC, storage, and observability.

## Readiness Checklist

- Replace placeholder program id in `shared/idl/cheshire_launchpad.json` and `shared/cheshire-launchpad/idl.ts`.
- Finish implementation review of `programs/cheshire-launchpad` and keep the generated IDL in sync with `shared/idl/cheshire_launchpad.json`.
- Add Anchor tests for all account constraints and event emissions.
- Add integration tests that call the existing DBC and Metaplex routes, then write registry records.
- Add a server-side route that appends registry instructions to launch transactions when the program id is configured.
- Use multisig or hardware wallet upgrade authority.
- Run `anchor build`, `anchor test`, `anchor deploy --provider.cluster devnet`, and a full devnet launch simulation.
- Run `solana program show <PROGRAM_ID>` and archive the final IDL and verifiable build hash.
- Mainnet deploy only after review of custody assumptions, admin pause authority, fee math, and migration authority.

## Sources

- Solana program deployment docs: https://solana.com/docs/core/programs/program-deployment
- Solana rent exemption RPC: https://solana.com/docs/rpc/http/getminimumbalanceforrentexemption
- Fly resource pricing: https://fly.io/docs/about/pricing/
