# ── Stage 1: install production deps ─────────────────────────────────────────
FROM node:22-alpine AS deps
RUN apk upgrade --no-cache
WORKDIR /build
COPY services/gateway/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# ── Stage 2: build TypeScript ─────────────────────────────────────────────────
FROM node:22-alpine AS build
RUN apk upgrade --no-cache
WORKDIR /build
COPY services/gateway/package*.json ./
RUN npm install --no-audit --no-fund
COPY services/gateway/ ./services/gateway/
WORKDIR /build/services/gateway
RUN npm run build

# ── Stage 3: minimal runtime image ───────────────────────────────────────────
FROM node:22-alpine AS runtime
RUN apk add --no-cache dumb-init

WORKDIR /app
ENV NODE_ENV=production

# Non-root user for reduced attack surface
RUN addgroup -S clawd && adduser -S -G clawd clawd \
    && mkdir -p /data && chown clawd:clawd /data

COPY --from=deps  --chown=clawd:clawd /build/node_modules ./node_modules
COPY --from=build --chown=clawd:clawd /build/services/gateway/dist ./dist
COPY --chown=clawd:clawd services/gateway/package*.json ./
COPY --chown=clawd:clawd trading/formal_verification/ ./trading/formal_verification/
COPY --chown=clawd:clawd skills/ ./skills/

# /data is the Fly persistent volume mount point for sessions.json
VOLUME ["/data"]

USER clawd
EXPOSE 8080

# dumb-init ensures SIGTERM propagates cleanly on Fly machine stop
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/src/index.js"]
