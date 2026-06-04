---
attestation:
  verified: true
  verified_at: '2026-06-04'
  registries:
  - https://x402.wtf/skills/imperial-trade-execution
  - https://solanaclawd.com/skills/imperial-trade-execution
homepage: https://solanaclawd.com/skills/imperial-trade-execution
---

# Imperial Trade Execution

Primary endpoint: `POST /api/v1/mobile/orders`

Default live open:

- `action=0`
- `orderType=0`
- `fundingStatus=0`
- `underwriter=2` for Phoenix unless requested otherwise

Default live close:

- `action=1`
- `orderType=0`
- same wallet and profile as the open position

Always verify:

- response `success`
- transaction `signature`
- follow-up state via `/positions` and `/orders`
