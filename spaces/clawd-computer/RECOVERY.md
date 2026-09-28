# Recovery — v1 → v2

## What happened

The original `solanaclawd/clawd-computer` Space was **paused on 2026-06-07** by Hugging Face's `abuse-handler` after the first build. The exact rule that fired:

```
Blocked by abuse-handler by rule: huggingface.co (10.0.247.222:443) x1.
cmdline match: 'ttyd' in
'ttyd -p 7681 -i 127.0.0.1 -W -t fontSize=15
 -t theme {"background":"#11071f"}
 bash -lc cd /home/user/app && /home/user/welcome.sh && exec bash'
```

What that means:

- The container ran a `ttyd` process whose arguments contained the string `bash` plus the literal `cd /home/user/app && /home/user/welcome.sh && exec bash`. That's the exact shape of a "shell-as-a-service" pattern, which HF's detector catches because it is heavily abused.
- The container also opened **one outbound TCP connection** to `huggingface.co:443` (10.0.247.222). This was almost certainly the `apt-get`/HF CLI call inside the image build, but the rule keys on the *runtime* cmdline, not the build, so it still tripped.
- `runtime.stage` flipped to `PAUSED` and the container never started. HF serves a generic landing page at the subdomain; nothing of `nginx`, `ttyd`, or `welcome.sh` runs.

The Space stayed paused for the entire lifetime of v1 because HF's auto-clear policy requires either (a) the offending code to be removed and a clean rebuild, or (b) a manual appeal.

## v2 fixes

| v1 (paused) | v2 (this branch) |
|---|---|
| `ttyd` web shell, bound 127.0.0.1:7681, exposed at `/terminal/` | No shell. Static homebase only. |
| `supervisord` runs `ttyd` + `nginx` | `supervisord` runs `nginx` only. |
| `nginx.conf` proxies `/terminal/` → `ttyd` (websocket) | `nginx.conf` is a vanilla static file server. |
| `Dockerfile` installs `ttyd` 1.7.7 from GitHub releases | `ttyd` is gone; image is ~5 MB smaller and one less GitHub round-trip. |
| `web/index.html` shows an `<iframe src="/terminal/">` | `web/index.html` shows a Jupiter swap panel and an HF Router model panel. |
| Token mint hardcoded in `welcome.sh` and `index.html` | Same, but the panel locks the swap to `$CLAWD` directly so the mint is the *input* to the widget, not a free-form field. |

## How to deploy v2

```bash
# 1) clone v2 (this branch) somewhere outside the monorepo
git clone -b fix/clawd-computer-no-ttyd \
    https://github.com/Solizardking/solana-clawd.git clawd-computer
cd clawd-computer
# OR, if you'd rather deploy straight from this repo:
git -C /Users/8bit/Downloads/solana-clawd/spaces/clawd-computer \
    remote set-url origin https://huggingface.co/spaces/solanaclawd/clawd-computer

# 2) (recommended) wire your personal Solana RPC into Space secrets
hf auth login
hf spaces secrets set SOLANA_RPC_URL="https://mainnet.helius-rpc.com/?api-key=..." --repo-type space solanaclawd/clawd-computer
hf spaces secrets set HF_TOKEN="hf_..."                                   --repo-type space solanaclawd/clawd-computer
hf spaces secrets set JUP_REFERRAL="YOUR_JUP_REFERRAL_ACCOUNT"            --repo-type space solanaclawd/clawd-computer

# 3) push and rebuild
git add -A && git commit -m "v2: drop ttyd, static homebase + Jupiter + HF Router"
git push origin main
hf spaces restart solanaclawd/clawd-computer
```

After the rebuild finishes, the runtime should report `stage: RUNNING` and the homebase will load at `https://solanaclawd-clawd-computer.hf.space/`. If the abuse flag is sticky even after a clean rebuild, see `APPEAL_EMAIL.txt` for a one-paragraph appeal.

## Why this should clear the abuse flag

The detector rule that fired was a substring match on `ttyd` plus a single outbound `huggingface.co:443` connection. v2 contains no `ttyd` in the image, no `bash` invocation, and no PTY. The image has the same Debian + node + python + nginx toolchain, but it never spawns a process whose cmdline resembles a web shell. The container's only outbound HTTPS will be browser → `plugin.jup.ag` and browser → `router.huggingface.co` (both initiated by the visitor, not the container), so the abuse-handler should not see a `huggingface.co:443` connection originating from the container.
