# Clawd Computer — web homebase for the Clawd agents
#
# v2 — ttyd removed. The HF abuse-handler was pausing the Space on
# "ttyd + outbound to huggingface.co" detection. We now serve a static
# homebase + a client-side Jupiter swap embed. The user's personal
# Solana RPC is injected at build time from a build arg or read at
# runtime from the HF Spaces secrets store (see README.md).
#
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    HOME=/home/user \
    PATH=/home/user/.local/bin:/usr/local/bin:$PATH \
    PYTHONUNBUFFERED=1

# Core userland (no ttyd, no bash-over-websocket tooling)
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl wget git jq ripgrep \
        python3 python3-pip python3-venv \
        nginx supervisor locales tini \
    && sed -i 's/# en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen && locale-gen \
    && rm -rf /var/lib/apt/lists/*

ENV LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

# Node.js 20 (NodeSource)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Hugging Face CLI
RUN pip3 install --no-cache-dir --break-system-packages huggingface_hub

# Non-root user (HF Spaces run as uid 1000)
RUN useradd -m -u 1000 user || true

# nginx must be writable/runnable by uid 1000
RUN mkdir -p /var/lib/nginx /var/log/nginx /run \
    && chown -R user:user /var/lib/nginx /var/log/nginx /run /etc/nginx

COPY --chown=user:user nginx.conf /etc/nginx/nginx.conf
COPY --chown=user:user supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY --chown=user:user web/ /home/user/web/
COPY --chown=user:user welcome.sh /home/user/welcome.sh

RUN chmod +x /home/user/welcome.sh

USER user
WORKDIR /home/user/app

EXPOSE 7860

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
