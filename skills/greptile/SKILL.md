---
name: greptile
description: AI code reviews via Greptile — trigger PR reviews, run local CLI reviews, query codebase graphs, apply auto-fixes, manage custom rules, and analyze review analytics. Use for code review, PR feedback, issue triage, and codebase exploration.
metadata:
  source: https://www.greptile.com/docs/llms.txt
  mcp-server: https://mcp.greptile.com
  docs-index: skills/greptile/llms.txt
  clawdbot:
    emoji: 🦎
    requires:
      anyBins:
        - greptile
attestation:
  verified: true
  verified_at: '2026-06-07'
  registries:
    - https://x402.wtf/skills/greptile
    - https://x402.wtf/skills/greptile
homepage: https://x402.wtf/skills/greptile
---

# Greptile — AI Code Review

Use Greptile for AI-powered code reviews with full codebase-graph context, custom rules enforcement, nitpick filtering, and one-click auto-fixes into your coding agent.

## Required First Step

Before exploring individual pages, read the local documentation index:

```bash
sed -n '1,51p' skills/greptile/llms.txt
```

The canonical remote index is:

```text
https://www.greptile.com/docs/llms.txt
```

Refresh the local copy when needed:

```bash
curl -fsSL https://www.greptile.com/docs/llms.txt -o skills/greptile/llms.txt
```

## Quickstart

Trigger a review by mentioning `@greptileai` in a PR, or run a local review:

```bash
greptile review --repo owner/repo --pr 42
```

For the full 5-minute setup: https://www.greptile.com/docs/quickstart.md

## MCP Server

Greptile exposes an MCP server for IDE-integrated code review tools:

```
https://mcp.greptile.com
```

Tools available via MCP (see https://www.greptile.com/docs/mcp-v2/tools.md for full reference):

| Tool | Purpose |
|---|---|
| `get_unaddressed_comments` | Fetch review comments not yet resolved |
| `apply_suggested_fix` | Apply an AI-suggested code fix |
| `list_coding_standards` | View team rules and patterns |
| `create_coding_standard` | Turn review feedback into enforceable rules |
| `get_pr_review_status` | Check review status for a PR |
| `get_weekly_report` | Generate team analytics report |

IDE setup instructions: https://www.greptile.com/docs/mcp-v2/setup.md

## Local CLI Reviews

Run Greptile locally from the terminal without opening a PR:

```bash
# Review staged changes
greptile review --local

# Review a specific file
greptile review --file src/agent/loop.ts

# Review with custom rules
greptile review --local --rules .greptile/rules.md
```

Full CLI reference: https://www.greptile.com/docs/code-review/greptile-cli.md

## Fix with your Agent

Greptile can route review comments directly into your coding agent (Claude Code, Codex, Cursor, Conductor, Devin). The bridge forwards each issue with full context (file, line numbers, comment, suggested fix).

### Setup

1. Install the bridge: `npm install -g greptile`
2. In Greptile dashboard → Settings → Review Settings → Choose your coding agents
3. On any PR review comment, click **Fix with your Agent**

```bash
# Verify bridge is installed
npm list -g greptile
```

Full setup: https://www.greptile.com/docs/integrations/fix-with-your-agent.md

## Auto-Fix via MCP

From within your IDE/agent, pull and fix review issues programmatically:

```bash
# Fetch unaddressed issues
greptile mcp get_unaddressed_comments --pr 42

# Apply suggested fix for a specific comment
greptile mcp apply_suggested_fix --comment-id abc123
```

Workflow docs: https://www.greptile.com/docs/mcp-v2/auto-fix.md

## Custom Rules & Standards

Configure repo-specific standards via `greptile.json` or `.greptile/` directory:

```json
{
  "rules": {
    "no-console-logs": "error",
    "prefer-early-returns": "warn",
    "max-function-length": 80
  },
  "ignore": ["**/*.test.ts", "**/dist/**"],
  "nitpick_level": "medium"
}
```

- `greptile.json` reference: https://www.greptile.com/docs/code-review/greptile-json-reference.md
- `.greptile/` config: https://www.greptile.com/docs/code-review/greptile-config.md
- Custom rules overview: https://www.greptile.com/docs/how-greptile-works/custom-rules.md

## Controlling Nitpickiness

Dial review strictness up or down:

- **Low**: Critical bugs, security, logic errors only
- **Medium**: Above + best practices, potential issues
- **High**: Everything including style nits

Configure per-repo via the dashboard or `greptile.json`. Greptile learns from your thumbs-up/down reactions to auto-tune over time.

Docs: https://www.greptile.com/docs/code-review/controlling-nitpickiness.md

## Training the System

React to review comments with emoji to teach Greptile what matters:

- 👍 = This was helpful, show more like this
- 👎 = This was noise, show less like this
- 🚀 = Critical catch, always flag these

Greptile's learning system adapts per-team and per-repo. Read more: https://www.greptile.com/docs/code-review/training-the-learning-system.md

## Cross-Repo Context

Link related repositories so Greptile reads them as context during reviews:

```
Repo Clusters → group repos that share dependencies or APIs
```

Docs: https://www.greptile.com/docs/code-review/cross-repo-context.md

## Self-Hosted Deployment

For air-gapped or on-prem deployments:

- Docker Compose: https://www.greptile.com/docs/docker-compose/overview.md
- Kubernetes (Helm): https://www.greptile.com/docs/kubernetes-new.md
- AWS Terraform: https://www.greptile.com/docs/docker-compose/aws-terraform.md
- Manual Linux: https://www.greptile.com/docs/docker-compose/manual-setup.md

## Troubleshooting

| Issue | Fix |
|---|---|
| Button doesn't appear on review comments | Check GitHub account linked in Settings → Linked Accounts, agent selected, bridge installed (`npm list -g greptile`) |
| Browser dialog missing after clicking Fix | Reinstall bridge: `npm install -g greptile`, check local network permissions in dashboard |
| Agent applies wrong fix | The agent uses review comment + suggested code as guidance. Always review diffs before committing |
| MCP tools unavailable | Verify `https://mcp.greptile.com` is accessible, check MCP server config in IDE settings |

Full troubleshooting: https://www.greptile.com/docs/integrations/fix-with-your-agent.md