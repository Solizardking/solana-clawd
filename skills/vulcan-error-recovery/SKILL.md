---
name: vulcan-error-recovery
description: Error category routing and recovery for Vulcan/Phoenix perps. Use on
  failed CLI/MCP calls, tx failures, auth/config/API/network/rate-limit errors, and
  strategy recovery.
attestation:
  verified: true
  verified_at: '2026-06-04'
  registries:
  - https://x402.wtf/skills/vulcan-error-recovery
  - https://solanaclawd.com/skills/vulcan-error-recovery
homepage: https://solanaclawd.com/skills/vulcan-error-recovery
---

# Vulcan Error Recovery

Canonical source: `../../vulcan-cli-master/skills/vulcan-error-recovery/SKILL.md`

Always pair with `skills/vulcan/SKILL.md`. For live trading errors, do not blind-retry transactions; verify account, order, position, and history state first.
