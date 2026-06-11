<!-- ╔══════════════════════════════════════════════════════╗ -->
<!-- ║  vendor/ — Vendored dependencies                     ║ -->
<!-- ╚══════════════════════════════════════════════════════╝ -->

<div align="center">

```
 __   _____ _  _ ___  ___  ___
 \ \ / / __| \| |   \/ _ \| _ \
  \ V /| _|| .` | |) | (_) |   /
   \_/ |___|_|\_|___/\___/|_|_\
```

**Vendored packages — pinned, audited, locally controlled**

</div>

---

## What's vendored

| Package | Description |
|---|---|
| `agent-auth/` | Full CAAP/1.0 agent auth stack — 5 packages, 116 TS files |

## agent-auth packages

The `vendor/agent-auth/` tree contains the complete CAAP/1.0 implementation:

| Package | Role |
|---|---|
| `agent-auth` | Core auth — SIWS, DAS, TEE attestation |
| `agent-auth-sdk` | TypeScript SDK for integrating CAAP/1.0 |
| `agent-auth-cli` | CLI for key management and agent registration |
| `agent-auth-solana` | Solana-specific adapters (wallet signing, DAS reads) |
| `agent-auth-clerk` | Clerk bridge for web-app CAAP flows |

## Why vendored?

These packages are tightly coupled to the OpenClawd on-chain protocol. Vendoring ensures:
- Pinned to the exact protocol version the runtime expects
- No surprise upstream breakages
- Local audits before upgrades

## Workspace registration

These are registered in `pnpm-workspace.yaml` as `vendor/agent-auth/packages/*` so they resolve as local workspace packages in all dependent packages.

---

> See also: [auth/](../auth/) · [CAAP/1.0 spec](https://github.com/better-auth/agent-auth) · MIT
