# spaces/ — push instructions (v5)

This directory holds the **clean, in-repo** sources for five deployments:

| Subdir | Type | Target |
|---|---|---|
| `clawd-computer/` | Docker Space | `huggingface.co/spaces/solanaclawd/clawd-computer` (currently **PAUSED** — see `clawd-computer/RECOVERY.md`) |
| `solanaclawd-pump-soft/` | static HF Space | `huggingface.co/spaces/solanaclawd/pump-soft` (must be created first) |
| `cheshire-terminal/` | Docker image (Fly) | **DEPRECATED** — rebranded to Trench Town. Files kept for the existing Fly deploy; new work in `trench-town/`. |
| `trench-town/` | Docker image (Fly) | `cheshire-clawd-terminal.fly.dev` → `cheshireterminal.ai` (live; new Trench Town brand) |
| `clawd-zoo/` | Gradio Space | `huggingface.co/spaces/solanaclawd/clawd-zoo` (live; 50+ agents + free AI chat via Pollinations) |

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

The HF repo already has v1. We **clone** it, **overlay** the v2 files,
**commit** on top, and **push**. ⚠️ **Do not** run `git init` inside the
subdir — the clone below is the only `git init` you need.

```bash
# Defensive cleanup: if a prior session accidentally ran `git init`
# inside the subdir, kill the nested .git so the parent monorepo
# can `git add` the Space normally.
rm -rf spaces/clawd-computer/.git
rm -rf spaces/solanaclawd-pump-soft/.git
rm -rf spaces/clawd-zoo/.git

TMP=$(mktemp -d)
git clone https://huggingface.co/spaces/solanaclawd/clawd-computer "$TMP/cc"
rsync -a --delete \
      --exclude='.git' --exclude='.git/' \
      spaces/clawd-computer/ "$TMP/cc/"

cd "$TMP/cc"
git add -A
git commit -m "v2: drop ttyd, static homebase + Jupiter plugin (locked to \$CLAWD) + HF Router"
# v1 is the only commit on main; v2 is a full replacement, so plain
# --force is correct (--force-with-lease will reject because the local
# has no record of origin/main's SHA — that's the "stale info" error).
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

HF `git push` does **not** auto-create a Space repo. ⚠️ If you skip the
`hf repos create` step, you'll see `remote: Repository not found`. Create
the Space first via the CLI (or the web UI), then push.

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

The Space is already live. The local mirror in `spaces/clawd-zoo/`
patches the chat to use **Pollinations** (truly keyless, no API key) as
the default backend, with ClawdRouter ZK as a paid opt-in. The previous
default `clawdrouter/auto` was returning `400 invalid model id`; all
`:free` models on ClawdRouter ZK are now `402 payment_required`.

```bash
TMP=$(mktemp -d)
git clone https://huggingface.co/spaces/solanaclawd/clawd-zoo "$TMP/cz"
rsync -a --delete \
      --exclude='.git' --exclude='.git/' \
      spaces/clawd-zoo/ "$TMP/cz/"

cd "$TMP/cz"
git add -A
git commit -m "v3: default to Pollinations (truly keyless) — ClawdRouter ZK 402s all :free models"
git push origin main
cd -
rm -rf "$TMP"
```

The Space auto-rebuilds on push. Verify after ~60s:
```bash
curl -s https://huggingface.co/api/spaces/solanaclawd/clawd-zoo \
  | python3 -c "import json,sys;d=json.load(sys.stdin);print('stage =',d['runtime']['stage'])"
```

## 4. Re-deploy Trench Town on Fly

The live Fly app is `cheshire-clawd-terminal` — the hostname is preserved
so existing links, cert, and DNS keep working. The new landing page in
`spaces/trench-town/` rebrands everything user-facing to **"Trench Town"**.

The `fly.toml` in `spaces/trench-town/` is **volumeless** (the static site
needs no persistent storage), so a fresh `fly deploy` works without
first creating a volume. If you see an error about `cheshire_data`, that
means a prior deploy added the mount — just remove the `[[mounts]]` block
from your live `fly.toml` (the in-repo copy already has it removed).

```bash
cd spaces/trench-town
fly deploy --app cheshire-clawd-terminal
# to also rename the internal slug (run from this dir so fly.toml is in scope):
#   fly apps rename cheshire-terminal
# then update `app = "cheshire-terminal"` in fly.toml and re-deploy.
```

To test locally:
```bash
cd spaces/trench-town
docker build -t trench-town .
docker run -p 8080:8080 trench-town
# open http://localhost:8080
```

## 5. (Optional) Re-deploy the legacy Cheshire Terminal build

Only needed if you want the old "Cheshire Terminal" landing back. The
dir is now a deprecation pointer; see `spaces/cheshire-terminal/README.md`.

```bash
cd spaces/cheshire-terminal
fly deploy --app cheshire-clawd-terminal
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
- `https://huggingface.co/spaces/solanaclawd/clawd-zoo` — 50+ agents + free Hermes-3 chat via Pollinations, no API key
- `https://cheshire-clawd-terminal.fly.dev` and `https://cheshireterminal.ai` — **Trench Town** landing: 7 roles, 8 Stages of Degen Evolution, TUPP, MEOW, Claw Beads, convoys, patrol board
