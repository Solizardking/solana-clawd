---
attestation:
  verified: true
  verified_at: '2026-06-04'
  registries:
  - https://x402.wtf/skills/imperial-market-intel
  - https://solanaclawd.com/skills/imperial-market-intel
homepage: https://solanaclawd.com/skills/imperial-market-intel
---

# Imperial Market Intel

Use for:

- `GET /api/v1/funding-rates`
- `GET /api/v1/mark-prices`
- `GET /api/v1/phoenix/mark-prices`
- `GET /api/v1/phoenix/depth`
- `GET /api/v1/route`

Preferred workflow:

1. Check funding and mark price for the canonical symbol.
2. Inspect Phoenix depth when the user cares about direct Phoenix fills.
3. Use `/route` for venue choice and expected fee/price context.
4. Distinguish canonical symbols (`SOL`, `BTC`, `XAU`) from Phoenix raw depth symbols (`SOL`, `GOLD`).
