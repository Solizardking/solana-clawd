FROM node:22-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src/ ./src/
COPY web/ ./web/
COPY vite.config.ts ./
RUN npm run build

# ── Runtime ─────────────────────────────────────────────────────────────────────
FROM node:22-slim

# Ollama — use official install script (handles all platforms and release formats)
RUN apt-get update -qq && apt-get install -y --no-install-recommends \
      curl ca-certificates zstd && \
    apt-get clean && rm -rf /var/lib/apt/lists/* && \
    curl -fsSL https://ollama.com/install.sh | sh

WORKDIR /app
COPY --from=deps  /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

ENV OLLAMA_MODELS=/root/.ollama/models
ENV PORT=8080
ENV OLLAMA_HOST=http://127.0.0.1:11434

COPY scripts/start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 8080 8081
CMD ["/start.sh"]
