# Cheshire Terminal — voice-controlled Solana terminal, branded build.
#
# A clean reference deployment of the Cheshire Terminal for Fly.io.
# This is the same brand that ships at https://cheshire-clawd-terminal.fly.dev
# and https://cheshireterminal.ai — the goal is to keep all three in sync.
#
# Build:    docker build -t cheshire-terminal .
# Run:      docker run -p 7860:7860 cheshire-terminal
# Deploy:   fly deploy -c fly.toml
#
FROM nginx:1.27-alpine

# Strip the default site
RUN rm -f /etc/nginx/conf.d/default.conf

# Static landing + soft widgets
COPY web/ /usr/share/nginx/html/

# nginx config
COPY nginx.conf /etc/nginx/conf.d/cheshire.conf

# HF Spaces metadata (this same image also runs as a static-ish Space)
# — the SDK config is read from the repo root on HF, not from the image.
EXPOSE 7860

# Fly.io's http_service expects port 8080; HF Spaces expect 7860.
# We bind both via the same listen directive, but Fly rewrites the
# `internal_port` in the fly.toml to 8080 (see fly.toml).
CMD ["nginx", "-g", "daemon off;"]
