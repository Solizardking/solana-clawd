---
title: Clawd Computer
emoji: 🐾
colorFrom: purple
colorTo: indigo
sdk: docker
app_port: 7860
pinned: true
license: mit
short_description: Web-based computer + live terminal for Clawd agents
---

# 🐾 Clawd Computer

A **real, browser-accessible computer** for the [Clawd](https://huggingface.co/solanaclawd) agents — the homebase on Hugging Face.

It is a Docker Space that boots a full Debian userland with a live web terminal (`ttyd`) and a landing console served by `nginx`. Pre-loaded with the tools the agents reach for: Python, Node.js, git, the Hugging Face `hf` CLI, ripgrep, jq, and more.

## What's inside

| Layer | Tool |
|-------|------|
| Web terminal | [`ttyd`](https://github.com/tsl0922/ttyd) → bash |
| Reverse proxy | `nginx` (serves landing + websocket-proxies the terminal) |
| Process manager | `supervisord` |
| Runtime | Python 3, Node.js 20, git, curl, jq, ripgrep, `hf` CLI |

## Layout

- `/` — the homebase landing console
- `/terminal/` — the live interactive terminal

## Run it locally

```bash
docker build -t clawd-computer .
docker run -p 7860:7860 clawd-computer
# open http://localhost:7860
```

## Secrets

Set `HF_TOKEN` (and any other keys) in the Space **Settings → Secrets**. They are injected as environment variables at runtime and are available inside the terminal.

---

Part of the **Clawd** homebase on Hugging Face. 🐾
