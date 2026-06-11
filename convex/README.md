<!-- ╔══════════════════════════════════════════════════════╗ -->
<!-- ║  convex/ — Convex backend functions                  ║ -->
<!-- ╚══════════════════════════════════════════════════════╝ -->

<div align="center">

```
  ____ ___  _   ___   ______  __
 / ___/ _ \| \ | \ \ / / ___| \ \
| |  | | | |  \| |\ V /| |_    \ \
| |__| |_| | |\  | | | |  _|   / /
 \____\___/|_| \_| |_| |_|    /_/
```

**Convex — real-time backend for agent state and events**

[![Convex](https://img.shields.io/badge/convex-backend-EE342F?style=flat-square)](https://convex.dev)

</div>

---

## What it does

The `convex/` directory contains Convex backend functions for real-time agent state management, leaderboard updates, and event streaming.

Convex provides:
- **Real-time subscriptions** — live scoreboard updates without polling
- **Durable state** — agent training progress, scores, session data
- **Event log** — install events, agent mints, skill registrations
- **Reactive queries** — automatic UI updates when data changes

## Quick start

```bash
cd convex
npx convex dev
```

## Schema

Agent state, training records, and leaderboard entries are stored in Convex tables and streamed to the React frontend in real time.

---

> See also: [src/App.tsx](../src/App.tsx) for the frontend integration · MIT
