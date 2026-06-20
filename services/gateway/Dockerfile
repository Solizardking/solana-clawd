# ── Stage 1: install production deps ─────────────────────────────────────────
FROM node:22-bookworm-slim AS deps
RUN apt-get update && apt-get upgrade -y --no-install-recommends && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY services/gateway/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# ── Stage 2: build TypeScript ─────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get upgrade -y --no-install-recommends && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY services/gateway/package*.json ./
RUN npm install --no-audit --no-fund
COPY services/gateway/ ./services/gateway/
WORKDIR /build/services/gateway
RUN npm run build

# ── Stage 3: minimal runtime image ───────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
RUN apt-get update \
    && apt-get upgrade -y --no-install-recommends \
    && apt-get install -y --no-install-recommends dumb-init \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

# Non-root user for reduced attack surface
RUN groupadd -r clawd && useradd -r -g clawd clawd \
    && install -d -o clawd -g clawd /data

COPY --from=deps  --chown=clawd:clawd /build/node_modules ./node_modules
COPY --from=build --chown=clawd:clawd /build/services/dist ./dist
COPY --chown=clawd:clawd services/gateway/package*.json ./

# /data is the Fly persistent volume mount point for sessions.json
VOLUME ["/data"]

USER clawd
EXPOSE 8080

# dumb-init ensures SIGTERM propagates cleanly on Fly machine stop
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/gateway/src/index.js"]
