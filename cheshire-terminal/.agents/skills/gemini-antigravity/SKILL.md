---
name: gemini-antigravity
description: Run code-execution tasks in an isolated Linux sandbox using the Antigravity Managed Agent. Provisions a fresh environment with Python, Node.js, and 4-CPU/16GB RAM per invocation.
homepage: https://ai.google.dev/gemini-api/docs/custom-agents
metadata:
  clawdbot:
    emoji: 🐚
    requires:
      env:
      - GEMINI_API_KEY
    primaryEnv: GEMINI_API_KEY
attestation:
  verified: true
  verified_at: '2026-06-06'
  registries:
  - https://x402.wtf/skills/gemini-antigravity
  - https://x402.wtf/skills/gemini-antigravity
---

# Antigravity Managed Agent

Run tasks in an isolated Linux sandbox with code execution, file management,
and web access. The agent provisions a fresh environment per invocation.

## Quickstart

**Basic code task:**
```bash
clawd-skills run gemini-antigravity --task "Write a Python script generating the first 50 Fibonacci numbers, plot them as a chart, and save to fibonacci.png"
```

**Clone a repo and run tests:**
```bash
clawd-skills run gemini-antigravity --task "Clone https://github.com/octocat/Spoon-Knife, run the test suite, and report results"
```

**With custom instructions:**
```bash
clawd-skills run gemini-antigravity --task "Analyze the Q1 revenue data and create a slide deck" \
  --agent-file .agents/AGENTS.md "Always use matplotlib for charts. Include summary tables."
```

**With GitHub credentials (private repos):**
```bash
clawd-skills run gemini-antigravity --task "Fix the failing test in my private repo" \
  --source "https://github.com/my-org/backend:/workspace/repo" \
  --network-allow "github.com:Authorization:Basic YOUR_BASE64_TOKEN" \
  --network-allow "pypi.org"
```

## Environment

| Resource | Value |
|---|---|
| CPU | 4 cores |
| Memory | 16 GB |
| OS | Ubuntu |
| Sandbox Persistence | 7 days idle, re-usable |

## Pre-installed Software

**UNIX tools:** curl, wget, git, rsync, unzip, ripgrep, jq, htop
**Python 3.12:** numpy, pandas, requests, google-genai, beautifulsoup4, matplotlib
**Node.js 22:** create-next-app, create-vite, typescript

## Sources

Mount files, repos, or data at environment start:

| Source type | Flag | Limit |
|---|---|---|
| Git repository | `--source REPO_URL:TARGET_DIR` | 500 MB |
| Cloud Storage | `--source gs://BUCKET/PATH:TARGET_DIR` | 2 GB |
| Inline content | `--agent-file TARGET_PATH "CONTENT"` | 1 MB/file, 2 MB total |

## Network Rules

Control outbound access with credentials injection:
```bash
--network-allow "api.github.com:Authorization:Basic TOKEN"
--network-allow "*.googleapis.com:Authorization:Bearer TOKEN"
--network-deny-all
```

## Agent Customization

**System instructions** (`--system-instruction`): Shape behavior per invocation.

**AGENTS.md** (`--agent-file .agents/AGENTS.md "..."`): Long-form persona definitions.

**Skills** (`--skill skills/slide-maker/SKILL.md "..."`): Extend agent capabilities with SKILL.md files.

## Multi-turn

Reuse the environment across interactions:
```bash
# First turn: set up environment
clawd-skills run gemini-antigravity --task "Install pandas, matplotlib, seaborn" --save-env

# Second turn: use the environment
clawd-skills run gemini-antigravity --task "Run analysis on /workspace/data.csv" --env ENV_ID
```

## Download Results

```bash
# Download full environment snapshot
curl "https://generativelanguage.googleapis.com/v1beta/files/environment-ENV_ID:download?alt=media" \
  -H "x-goog-api-key: $GEMINI_API_KEY" -o snapshot.tar
tar -xf snapshot.tar -C results/
```

## Limitations

- Binary file support not yet available (text and images only)
- Max Git repo size: 500 MB
- Max GCS source size: 2 GB
- Environment startup: ~5 seconds + source mount time
- Preview: Features and schemas may change