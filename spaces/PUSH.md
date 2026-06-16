# spaces/ — push instructions (v3)

This directory holds the **clean, in-repo** sources for five deployments:

| Subdir | Type | Target |
|---|---|---|
| `clawd-computer/` | Docker Space | `huggingface.co/spaces/solanaclawd/clawd-computer` (currently **PAUSED** — see `clawd-computer/RECOVERY.md`) |
| `solanaclawd-pump-soft/` | static HF Space | `huggingface.co/spaces/solanaclawd/pump-soft` (must be created first) |
| `cheshire-terminal/` | Docker image + Fly app | `cheshire-clawd-terminal.fly.dev` → `cheshireterminal.ai` (live) |
| `clawd-zoo/` | Gradio Space | `huggingface.co/spaces/solanaclawd/clawd-zoo` (live; 50+ agents + free AI chat) |
| `solgpt/` | Gradio Space | `huggingface.co/spaces/solanaclawd/solgpt` (new; free Solana-native AI chat, direct OpenRouter) |

All sources are committed on `fix/clawd-computer-no-ttyd` and pushed to
`origin/fix/clawd-computer-no-ttyd`. The HF / Fly pushes happen from the
parent monorepo, not from the subdirs.

## Prerequisites

```bash
# Hugging Face
pip install --upgrade "huggingface_hub[cli]"
hf auth login                                # paste a token with repo.write on solanaclawd/*
hf auth whoami                               # confirm

# Fly
curl -L https://fly.io/install.sh | sh
fly auth login
```

> **Important:** do **not** run `git init` inside any of the Space subdirs.
> The monorepo already owns these files, and a nested `git init` makes the
> parent `git add` fail with *"does not have a commit checked out"*. The HF
> pushes below use a separate clone (or the Hub API) and don't write into
> the monorepo.

## 1. Push the v2 `solanaclawd/clawd-computer`

The HF repo already has v1. We clone it, overlay the v2 files, commit on
top, and push.

```bash
# clean any prior nested init (defensive)
rm -rf spaces/clawd-computer/.git spaces/solanaclawd-pump-soft/.git

TMP=$(mktemp -d)
git clone https://huggingface.co/spaces/solanaclawd/clawd-computer "$TMP/cc"
rsync -a --delete \
      --exclude='.git' --exclude='.git/' \
      spaces/clawd-computer/ "$TMP/cc/"

cd "$TMP/cc"
git add -A
git commit -m "v2: drop ttyd, static homebase + Jupiter plugin (locked to \$CLAWD) + HF Router"
# v1 is the only commit on main; v2 is a full replacement, so --force is correct
git push --force origin main
cd -
rm -rf "$TMP"
```

After ~60–120 s, check the runtime:
```bash
curl -s https://huggingface.co/api/spaces/solanaclawd/clawd-computer \
  | python3 -c "import json,sys;d=json.load(sys.stdin);print('stage =',d['runtime']['stage']);print('error =',d['runtime'].get('errorMessage'))"
```

If `stage` is still `PAUSED` after a clean rebuild, send the email in
`spaces/clawd-computer/APPEAL_EMAIL.txt`.

## 2. Create and push the new `solanaclawd/pump-soft`

HF `git push` does **not** auto-create a Space repo. Create it first via
the CLI (or the web UI), then push.

```bash
# one-time: create the Space (static, public)
hf repos create solanaclawd/pump-soft \
    --repo-type space \
    --space-sdk static \
    --exist-ok

TMP=$(mktemp -d)
git clone https://huggingface.co/spaces/solanaclawd/pump-soft "$TMP/ps"
rsync -a --delete \
      --exclude='.git' --exclude='.git/' \
      spaces/solanaclawd-pump-soft/ "$TMP/ps/"

cd "$TMP/ps"
git add -A
git commit -m "v1: soft, read-only mirror of ordlibrary/pump-mcp"
git push -u origin main
cd -
rm -rf "$TMP"

# verify it serves
curl -sIL https://huggingface.co/spaces/solanaclawd/pump-soft | head -3
```

## 3. Push the patched `solanaclawd/clawd-zoo`

The Space is already live and the chat works (verified 2026-06-16), but
the previous default `clawdrouter/auto` profile was occasionally routing
to an invalid OpenRouter model ID and returning 400. The local mirror in
`spaces/clawd-zoo/` patches the default to the verified-working
`nousresearch/hermes-3-llama-3.1-405b:free` and adds a fallback chain so
the user never sees a surfaced 400.

```bash
TMP=$(mktemp -d)
git clone https://huggingface.co/spaces/solanaclawd/clawd-zoo "$TMP/cz"
rsync -a --delete \
      --exclude='.git' --exclude='.git/' \
      spaces/clawd-zoo/ "$TMP/cz/"

cd "$TMP/cz"
git add -A
git commit -m "fix: default to working :free model, add fallback chain for auto-profile 400s"
git push origin main
cd -
rm -rf "$TMP"
```

The Space auto-rebuilds on push. Verify after ~60s:
```bash
curl -s https://huggingface.co/api/spaces/solanaclawd/clawd-zoo \
  | python3 -c "import json,sys;d=json.load(sys.stdin);print('stage =',d['runtime']['stage'])"
```

## 4. Create and push the new `solanaclawd/solgpt`

A free, Solana-native AI chat that talks **directly** to OpenRouter
(no ClawdRouter hop) using a server-side `OPENROUTER_API_KEY`. Defaults
to OpenRouter's free model tier, so the chat costs every visitor $0.

```bash
# one-time: create the Space (Gradio, public)
hf repos create solanaclawd/solgpt \
    --repo-type space \
    --space-sdk gradio \
    --exist-ok

TMP=$(mktemp -d)
git clone https://huggingface.co/spaces/solanaclawd/solgpt "$TMP/sg"
rsync -a --delete \
      --exclude='.git' --exclude='.git/' \
      spaces/solgpt/ "$TMP/sg/"

cd "$TMP/sg"
git add -A
git commit -m "v1: SolGPT — free Solana-native AI chat, direct OpenRouter integration"
git push -u origin main
cd -
rm -rf "$TMP"
```

**Before the chat works**, set the Space secret (one-time, via the web
UI — Space → Settings → Variables and secrets, or the CLI below):

```bash
# copy the key already provisioned for clawdrouter/clawd-code/clawd-pump,
# or mint a fresh one at https://openrouter.ai/keys (no credit card)
KEY=$(grep '^OPENROUTER_API_KEY=' services/clawdrouter/.env | cut -d= -f2-)
hf repos secret-set solanaclawd/solgpt OPENROUTER_API_KEY "$KEY" --repo-type space
```

Verify after ~60s:
```bash
curl -s https://huggingface.co/api/spaces/solanaclawd/solgpt \
  | python3 -c "import json,sys;d=json.load(sys.stdin);print('stage =',d['runtime']['stage'])"
```

The Space's **📡 Status** tab confirms the key is live (masked) and
shows current usage/limit straight from OpenRouter's `/key` endpoint.

## 5. (Optional) Re-deploy or rename the Cheshire Terminal on Fly

The live Fly app is `cheshire-clawd-terminal`. This dir is a clean
reference build of the same brand. To redeploy:

```bash
cd spaces/cheshire-terminal
fly deploy --app cheshire-clawd-terminal
# or, to spin up a NEW app called `cheshire-terminal`:
fly apps create cheshire-terminal
# (then update `app = "cheshire-terminal"` in fly.toml)
fly deploy
```

To rename the existing app from `cheshire-clawd-terminal` → `cheshire-terminal`:
```bash
# run from spaces/cheshire-terminal/ so fly.toml is in scope
fly apps rename cheshire-terminal
# then update `app = "cheshire-terminal"` in fly.toml
# and re-issue the cert for the custom domain:
fly certs create cheshireterminal.ai -a cheshire-terminal
```

## 6. Mirror this tree back to the GitHub monorepo

The branch is already on `origin/fix/clawd-computer-no-ttyd`; no extra push
needed unless you amend it. Open a PR when ready:

```
https://github.com/Solizardking/solana-clawd/compare/main...fix/clawd-computer-no-ttyd
```

## What you should see when it all works

- `https://solanaclawd-clawd-computer.hf.space/` — the static homebase, swap panel locked to `$CLAWD`, model panel
- `https://huggingface.co/spaces/solanaclawd/pump-soft` — the soft pump-mcp mirror with the Jupiter quote box
- `https://huggingface.co/spaces/solanaclawd/clawd-zoo` — 50+ agents + free Hermes-3 chat, no API key
- `https://huggingface.co/spaces/solanaclawd/solgpt` — free Solana-native AI chat, direct OpenRouter, no API key from visitors
- `https://cheshire-clawd-terminal.fly.dev` — unchanged, still branded "Cheshire Terminal — Powered by $CLAWD"
- `https://cheshireterminal.ai` — unchanged, primary branding surface
