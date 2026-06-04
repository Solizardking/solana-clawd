---
attestation:
  verified: true
  verified_at: '2026-06-04'
  registries:
  - https://x402.wtf/skills/imperial-grid-trading
  - https://solanaclawd.com/skills/imperial-grid-trading
homepage: https://solanaclawd.com/skills/imperial-grid-trading
---

# Imperial Grid Trading

Imperial can place individual orders, but grid maintenance is a strategy concern.

Use this skill for:

- designing lower/upper bounds and per-level size
- choosing Phoenix as the preferred venue for direct perps grid execution
- defining replacement behaviour after fills
- deciding when a live grid requires a dedicated runner

Runner boundary:

- A real grid requires stateful monitoring, re-placement, and reconciliation. Document that boundary clearly when the request arrives via Telegram.
