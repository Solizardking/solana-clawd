# Phoenix Perpetuals Integration

Phoenix perps live at `/perps` (or `/phoenix`). Token-gated behind `$CLAWD`.

## Components

- `server/routes/phoenix.ts` — proxies `GET https://perp-api.phoenix.trade/exchange/markets` through `/api/phoenix/markets` with 10s cache + 60s stale-while-revalidate.
- `client/src/lib/phoenix.ts` — typed fetcher, formatting helpers, builder-authority env reader.
- `client/src/components/PhoenixPerpsPanel.tsx` — market tabs (SOL/BTC/ETH-PERP), parameters, leverage tiers, order builder, Flight builder card.
- `client/src/pages/PhoenixPerpsPage.tsx` — page wrapper with the panel.

The order panel currently builds the position client-side and opens phoenix.trade for execution — Phoenix perps is in private beta and signed-order submission requires the Rise SDK (TypeScript builder bindings, currently in beta) plus a Phoenix access/referral code on the trader account.

## RPC

Uses the existing Helius RPC configured by `VITE_HELIUS_RPC_URL` (already wired in `client/src/lib/solanaConfig.ts`). No new RPC needed.

## Flight Builder Code

We register the terminal as a Phoenix Flight builder to earn fees on routed flow.

### One-time setup

1. Create a **fresh, empty wallet** dedicated to builder fees (recommended — keeps revenue isolated from trading collateral).
2. Visit https://flight.phoenix.trade and connect that wallet.
3. Register the builder: set the fee in bps (added on top of Phoenix's base maker/taker fees). The portal runs an on-chain instruction binding your wallet as the builder authority to a Phoenix trader account where fees accrue.
4. Copy the builder authority pubkey into `.env`:

```
PHOENIX_BUILDER_AUTHORITY=<your-builder-pubkey>
PHOENIX_BUILDER_TRADER_ACCOUNT=<your-builder-trader-account>
PHOENIX_FLIGHT_BUILDER_AUTHORITY=<your-builder-pubkey>
PHOENIX_FLIGHT_FEE_BPS=5
PHOENIX_LEGACY_BUILDER_AUTHORITY=<your-builder-pubkey>
PHOENIX_LEGACY_BUILDER_FEE_BPS=5
PHOENIX_LEGACY_REFERRER=<your-referrer-pubkey>
VITE_PHOENIX_BUILDER_AUTHORITY=<your-builder-pubkey>
VITE_PHOENIX_BUILDER_TRADER_ACCOUNT=<your-builder-trader-account>
```

5. Once set, the Phoenix panel shows "Builder authority configured" and orders routed via Rise SDK include the Flight wrap automatically. Fees withdraw from the Flight dashboard.

### Fee model

Flight currently collects on **liquidity-removing fills only**:
- Market orders
- Taking portion of a limit order that crosses the book

Resting maker fills do not generate Flight fees today (maker-side collection is on Phoenix's roadmap).

The builder fee stacks on top of Phoenix's base fees and is paid by the trader.

## Next steps (Rise SDK integration)

When ready to sign and submit perp orders directly from the terminal:

1. Add `@phoenix-fi/rise` (TypeScript) once GA / accessible.
2. Construct the client with `builderAuthority: PHOENIX_BUILDER_AUTHORITY` so supported instructions auto-wrap into Flight-routed orders.
3. Use the existing `createConnection()` from `client/src/lib/solanaConfig.ts` for the RPC.
4. Pipe order construction through the order panel in `PhoenixPerpsPanel.tsx` (replace the "Open on Phoenix" button with a sign+submit flow modeled on `DFlowSwapPanel`).

## Reference

- Phoenix docs index: https://docs.phoenix.trade/llms.txt
- Market parameters API: https://perp-api.phoenix.trade/exchange/markets
- Flight portal: https://flight.phoenix.trade
- Phoenix Legacy (spot) SDK: `@ellipsis-labs/phoenix-sdk`
