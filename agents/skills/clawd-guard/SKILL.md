---
name: clawd-guard
description: >
  Scans staged git changes for secrets before committing: Solana/ETH keys, API keys (XAI, OpenAI,
  Anthropic, AWS, Stripe, GitHub), PEM blocks, seed phrases, DB URLs. Prevents secret leaks.
license: MIT
metadata:
  author: openclawdsolana
  version: "1.0"
allowed-tools: Bash(git:*) Bash(grep:*)
---

# Clawd Guard — Local Secret Scan

Scan staged changes for secrets before commit.

## Instructions

### 1. Get the diff

```bash
DIFF=$(git diff --cached)
[ -z "$DIFF" ] && DIFF=$(git diff HEAD)
```

### 2. Pattern scan (only `+` lines)

```bash
echo "$DIFF" | grep "^+" | grep -E "[1-9A-HJ-NP-Za-km-z]{87,88}" | head -3  # Solana key
echo "$DIFF" | grep "^+" | grep -E "0x[a-fA-F0-9]{64}" | head -3              # ETH key
echo "$DIFF" | grep "^+" | grep -E "AKIA[0-9A-Z]{16}" | head -3               # AWS key
echo "$DIFF" | grep "^+" | grep -E "gh[pousr]_[A-Za-z0-9_]{36,}" | head -3   # GitHub token
echo "$DIFF" | grep "^+" | grep -E "(xai-|sk-ant-|sk-proj-)[A-Za-z0-9_-]{20,}" | head -3
echo "$DIFF" | grep "^+" | grep -E "BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY" | head -3
echo "$DIFF" | grep "^+" | grep -E "(mongodb|postgresql|mysql):\/\/[^:@]+:[^@]+@" | head -3
echo "$DIFF" | grep "^+" | grep -iE "(api_key|secret|password)\s*[=:]\s*[\"'][^\"']{16,}" \
  | grep -vE "(process\.env|your[_-]|placeholder|\$\{)" | head -3
```

### 3. Check secret files staged

```bash
git diff --cached --name-only | grep -iE "\.(env|pem|key)$|wallet\.json|keypair\.json"
```

### 4. Report

- CRITICAL/HIGH findings: show file:line + **redacted value** (first4****last4)
- If secret files staged: warn + suggest `git restore --staged <file>`
- If clean: `✅ Clawd Guard: No secrets in staged changes`
- If issues: never print full secret; suggest `.env` + `process.env.VAR`; if already committed: rotate + `git filter-repo`
