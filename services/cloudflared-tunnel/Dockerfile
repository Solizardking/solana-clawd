FROM cloudflare/cloudflared:latest

# cloudflared reads TUNNEL_TOKEN env var automatically when set.
# We expose the built-in metrics/readiness server on port 2000 for Fly health checks.
CMD ["tunnel", "--no-autoupdate", "--metrics", "0.0.0.0:2000", "run"]
