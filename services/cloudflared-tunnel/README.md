<!-- ╔══════════════════════════════════════════════════════╗ -->
<!-- ║  cloudflared-tunnel/ — Cloudflare Tunnel config      ║ -->
<!-- ╚══════════════════════════════════════════════════════╝ -->

<div align="center">

```
  ____ _     ___  _   _ ____  _____ _        _    ____  _____ ____
 / ___| |   / _ \| | | |  _ \|  ___| |      / \  |  _ \| ____|  _ \
| |   | |  | | | | | | | | | | |_  | |     / _ \ | |_) |  _| | | | |
| |___| |__| |_| | |_| | |_| |  _| | |___ / ___ \|  _ <| |___| |_| |
 \____|_____\___/ \___/|____/|_|   |_____/_/   \_\_| \_\_____|____/
```

**Cloudflare Tunnel — expose local services publicly without port forwarding**

[![Cloudflare](https://img.shields.io/badge/cloudflare-tunnel-F38020?style=flat-square&logo=cloudflare)](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)

</div>

---

## What it does

Provides a zero-trust tunnel from `localhost` to a public URL via Cloudflare. Used for:

- Exposing the local MCP server for remote Claude Code sessions
- Telegram webhook development (local bot testing)
- Gateway development without deploying to fly.io

## Quick start

```bash
# Install cloudflared
brew install cloudflared

# Or use the Docker image in this folder:
docker build -t clawd-tunnel ./cloudflared-tunnel
docker run clawd-tunnel

# Tunnel to local port 3000
cloudflared tunnel --url http://localhost:3000
```

## Configuration

See `fly.toml` for the production tunnel configuration on fly.io. The Docker setup provides a portable, self-contained tunnel runner.

---

> See [tunnel.md](../tunnel.md) for the full tunnel setup guide · MIT
