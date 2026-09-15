# Cheshire Terminal — voice-controlled Solana terminal, branded build.
#
# A clean reference deployment of the Cheshire Terminal for Fly.io.
# This is the same brand that ships at https://cheshire-clawd-terminal.fly.dev
# and https://cheshireterminal.ai — the goal is to keep all three in sync.
#
# Build:    docker build -t cheshire-terminal .
# Run:      docker run -p 8080:8080 cheshire-terminal
# Deploy:   fly deploy -c fly.toml
#
FROM nginx:1.27-alpine

# Strip the default site
RUN rm -f /etc/nginx/conf.d/default.conf

# Static landing + soft widgets
COPY web/ /usr/share/nginx/html/

# nginx config (listens on 8080 for Fly, 7860 for HF Spaces)
COPY nginx.conf /etc/nginx/conf.d/cheshire.conf

EXPOSE 8080 7860

CMD ["nginx", "-g", "daemon off;"]
