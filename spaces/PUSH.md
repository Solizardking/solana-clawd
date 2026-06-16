# spaces/ — push instructions

This directory holds the **clean, in-repo** sources for three deployments:

| Subdir | Type | Target |
|---|---|---|
| `clawd-computer/` | Docker Space | `huggingface.co/spaces/solanaclawd/clawd-computer` (currently **PAUSED** — see `clawd-computer/RECOVERY.md`) |
| `solanaclawd-pump-soft/` | static HF Space | `huggingface.co/spaces/solanaclawd/pump-soft` (new) |
| `cheshire-terminal/` | Docker image + Fly app | `cheshire-clawd-terminal.fly.dev` → `cheshireterminal.ai` (live) |

All three branches are committed together on `fix/clawd-computer-no-ttyd`. The
$HUGGING_FACE / $FLY pushes happen from inside each subdir.

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

## 1. Push the patched `solanaclawd/clawd-computer` (v2)

```bash
cd spaces/clawd-computer
git init -q
git remote add origin https://huggingface.co/spaces/solanaclawd/clawd-computer
git add -A
git commit -m "v2: drop ttyd, static homebase + Jupiter plugin + HF Router"
git push --force-with-lease origin main
# the runtime will be re-evaluated; abuse flag should clear on a clean build
# if not, send the email in APPEAL_EMAIL.txt
```

After ~90s, hit:
```bash
curl -s https://huggingface.co/api/spaces/solanaclawd/clawd-computer \
  | python3 -c "import json,sys;d=json.load(sys.stdin);print('stage =',d['runtime']['stage'])"
```

## 2. Push the new `solanaclawd/pump-soft`

The HF API will let you create the Space on first push:

```bash
cd ../solanaclawd-pump-soft
git init -q
git remote add origin https://huggingface.co/spaces/solanaclawd/pump-soft
git add -A
git commit -m "v1: soft, read-only mirror of ordlibrary/pump-mcp"
git push origin main
# then: hf repos settings --repo-type space solanaclawd/pump-soft --description "Soft read-only mirror of pump-mcp"
```

## 3. (Optional) Re-deploy the Cheshire Terminal to Fly

The live Fly app is `cheshire-clawd-terminal`. This dir is a clean reference
build of the same brand. To redeploy:

```bash
cd ../cheshire-terminal
fly deploy --app cheshire-clawd-terminal
# or, to spin up a NEW app called `cheshire-terminal`:
fly apps create cheshire-terminal
# (then update `app = "cheshire-terminal"` in fly.toml)
fly deploy
```

To rename the existing app from `cheshire-clawd-terminal` → `cheshire-terminal`:
```bash
fly apps rename cheshire-terminal           # run from spaces/cheshire-terminal/
# then update `app = "cheshire-terminal"` in fly.toml
# and add cheshireterminal.ai to the certificate:
fly certs create cheshireterminal.ai -a cheshire-terminal
```

## 4. Mirror this tree back to the GitHub monorepo

```bash
cd ../..
git add spaces/
git commit -m "spaces: clawd-computer v2 (no ttyd) + pump-soft + cheshire-terminal reference build"
git push origin fix/clawd-computer-no-ttyd
```

## What you should see when it all works

- `https://solanaclawd-clawd-computer.hf.space/` — the static homebase, swap panel locked to `$CLAWD`, model panel
- `https://huggingface.co/spaces/solanaclawd/pump-soft` — the soft pump-mcp mirror with the Jupiter quote box
- `https://cheshire-clawd-terminal.fly.dev` — unchanged, still branded "Cheshire Terminal — Powered by $CLAWD"
- `https://cheshireterminal.ai` — unchanged, primary branding surface
