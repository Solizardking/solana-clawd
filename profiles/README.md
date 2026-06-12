# 👤 OpenClawd Profiles

> *Inspired by Hermes (Nous Research) — adapted for the claw.*

Every agent needs a home. A **profile** is an isolated agent home directory with its own config, secrets, personality, memories, sessions, skills, and gateway state. Think of it like a user account for your AI agent.

```
~/.openclawd/
├── state.json              ← active profile
└── profiles/
    ├── default/
    │   ├── config.yaml     ← model, provider, toolsets, terminal defaults
    │   ├── .env            ← scoped secrets
    │   ├── CLAWD.md         ← personality / operating charter
    │   ├── memories/       ← long-term memory store
    │   ├── sessions/       ← conversation history
    │   ├── skills/         ← profile-local skill overrides
    │   └── gateway/        ← cached gateway config
    ├── degen-trader/
    ├── research-claw/
    └── arb-hunter/
```

---

## Why Profiles?

- **Isolation** — each agent persona gets its own wallet config, model prefs, memory bank
- **Speed** — run `trader` instead of `clawd -p degen-trader` once you've set up aliases
- **Portable** — export a profile as a `.tar.gz`, import it on any machine
- **Multi-agent** — run multiple claws simultaneously without state collisions

---

## Quick Start

```bash
# Create your first profile
clawd profile create default

# List profiles
clawd profile list

# Switch active profile
clawd profile use degen-trader

# Inspect a profile
clawd profile show
clawd profile show research-claw

# Run the profile's alias (auto-installed by clawd-profile)
trader "buy 0.1 SOL of $PEPE"
```

---

## Commands

| Command | Description |
|---------|-------------|
| `clawd profile create <name>` | Scaffold a new profile + install its alias |
| `clawd profile list` | List all profiles (● = active) |
| `clawd profile show [name]` | Inspect profile contents and stats |
| `clawd profile use <name>` | Set active profile (sticky across sessions) |
| `clawd profile rename <old> <new>` | Rename a profile |
| `clawd profile clone <src> <dst>` | Duplicate a profile |
| `clawd profile delete <name>` | Remove a profile (prompts confirmation) |
| `clawd profile export <name> [file]` | Export profile as `.tar.gz` |
| `clawd profile import <archive>` | Import a profile from `.tar.gz` |
| `clawd profile path [name]` | Print profile directory path |

---

## CLAWD.md — The Soul of the Claw

Each profile ships with a **CLAWD.md** (adapted from Hermes' `SOUL.md`). This is the personality charter for that agent — its identity, operating style, hard limits, and domain focus.

Edit it to shape your agent:
- Change the persona (trader vs researcher vs security auditor)
- Set hard limits (max trade size, allowed DEXs)
- Define tone and communication style
- Add domain-specific directives

---

## CLI Aliases

When you `create` a profile, `clawd-profile` installs a wrapper script at `~/.local/bin/<name>`:

```bash
# ~/.local/bin/degen-trader
#!/usr/bin/env bash
exec clawd -p degen-trader "$@"
```

Make sure `~/.local/bin` is in your `$PATH`. The install script handles this automatically.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCLAWD_HOME` | `~/.openclawd` | Root state directory |
| `CLAWD_BIN_DIR` | `~/.local/bin` | Where profile aliases are installed |

---

## Profiles vs Sandboxes

**Profiles ≠ Sandboxes.** A profile gives you *state isolation* (separate memories, configs, secrets). Sandbox isolation (network namespace, filesystem restrictions) is handled separately by the runtime (Honcho, E2B, etc.).

---

## Profiles in the Install Script

Running `install.sh` will optionally scaffold your first profile with sensible defaults. You can always create more profiles later:

```bash
./install.sh          # creates 'default' profile automatically
clawd profile create degen-trader
clawd profile create research-claw
clawd profile clone default arb-hunter
```

---

## OpenClawd Multi-Agent with Honcho

For true parallel multi-agent operation, profiles work alongside Honcho:

```yaml
# honcho.yaml
services:
  degen-trader:
    command: clawd -p degen-trader
    env:
      OPENCLAWD_HOME: ~/.openclawd

  research-claw:
    command: clawd -p research-claw
    env:
      OPENCLAWD_HOME: ~/.openclawd
```

```bash
honcho start           # run all profiles in parallel
honcho logs -f         # stream all profile logs
```

---

🦞 *Every claw needs a home.*