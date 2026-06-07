# Clawd Computer — a real web-based computer for the Clawd agents
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    HOME=/home/user \
    PATH=/home/user/.local/bin:/usr/local/bin:$PATH \
    PYTHONUNBUFFERED=1

# Core userland + tools the agents reach for
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl wget git jq ripgrep nano vim less \
        build-essential python3 python3-pip python3-venv \
        nginx supervisor locales tini \
    && sed -i 's/# en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen && locale-gen \
    && rm -rf /var/lib/apt/lists/*

# ttyd static binary (not in Debian repos) — pick arch at build time
RUN set -eux; \
    arch="$(dpkg --print-architecture)"; \
    case "$arch" in \
      amd64) ttyd_arch="x86_64" ;; \
      arm64) ttyd_arch="aarch64" ;; \
      *) echo "unsupported arch: $arch"; exit 1 ;; \
    esac; \
    curl -fsSL "https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.${ttyd_arch}" -o /usr/local/bin/ttyd; \
    chmod +x /usr/local/bin/ttyd; \
    ttyd --version

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
