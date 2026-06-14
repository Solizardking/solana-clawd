# Cheshire Launchpad SDK

First-party SDK and IDL for Cheshire token launches, agent-token launches, p-token launches, fee routing, bonding-curve metadata, AMM routing, and migration records.

The on-chain program is intentionally a launch registry and control plane. It records launch facts and route configuration, while execution stays in the existing specialized launch backends:

- Pump-style launches: synthetic reserve curve metadata plus PumpSwap migration target.
- Meteora launches: Dynamic Bonding Curve metadata plus DAMM v2 migration target.
- Agent launches: Metaplex Core agent profile plus linked token mint.
- P-token launches: first-party Cheshire launch records with configurable curve, AMM, and fee routes.

## Managed Launch Example

```ts
import {
  AmmRoute,
  CHESHIRE_AGENT_TOKEN_FEE_PROFILE,
  CurveRoute,
  FeeRoute,
  LaunchKind,
  PUMP_STYLE_CURVE_SNAPSHOT,
  SOL_MINT,
  buildLaunchManagedTokenInstruction,
} from "./index";

const ix = buildLaunchManagedTokenInstruction({
  creator,
  tokenMint,
  launchKind: LaunchKind.AgentToken,
  curveRoute: CurveRoute.PumpSynthetic,
  ammRoute: AmmRoute.PumpSwap,
  feeRoute: FeeRoute.ProtocolCreatorAgent,
  quoteMint: SOL_MINT,
  name: "Clawd Agent",
  symbol: "CLAWD-AI",
  metadataUri: "https://example.com/metadata.json",
  agentProfile,
  curvePool,
  feeProfile: CHESHIRE_AGENT_TOKEN_FEE_PROFILE,
  curveSnapshot: PUMP_STYLE_CURVE_SNAPSHOT,
});
```

## Planning Quotes

The quote helpers are deterministic planning utilities for the UI and launch preview. They are not a substitute for the final transaction quote from the active route provider.

```ts
import {
  PUMP_STYLE_CURVE_SNAPSHOT,
  PUMP_STYLE_FEE_PROFILE,
  quoteCurveBuyExactQuoteIn,
} from "./index";

const preview = quoteCurveBuyExactQuoteIn(
  PUMP_STYLE_CURVE_SNAPSHOT,
  1_000_000_000n,
  PUMP_STYLE_FEE_PROFILE,
);
```

## Mainnet Checklist

- Replace `CHESHIRE_LAUNCHPAD_PROGRAM_ID` with the generated deploy key.
- Run `anchor build -p cheshire_launchpad`.
- Regenerate and diff the IDL before deploy.
- Run devnet tests for token, agent-token, p-token, migration, and phase changes.
- Use a multisig or hardware wallet as upgrade authority.
- Keep custody and swap execution outside this v1 registry program until the AMM code is audited.
