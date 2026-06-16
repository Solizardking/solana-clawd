# Trench Town — landing for the Clawd sovereign agent harness
#
# A clean reference deployment of the Trench Town brand for Fly.io.
# The live app is hosted at:
#   - https://cheshire-clawd-terminal.fly.dev  (Fly-assigned hostname, preserved)
#   - https://cheshireterminal.ai             (custom domain, primary)
#
# Brand everywhere user-facing: "Trench Town" / "the AI town where Clawd lives".
# Internal Fly app slug remains "cheshire-clawd-terminal" for now (public DNS
# is already pointed at it; renaming is optional, see README.md).
#
# Build:   docker build -t trench-town .
# Run:     docker run -p 8080:8080 trench-town
# Deploy:  fly deploy -c fly.toml
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
