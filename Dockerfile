FROM node:22-slim AS deps
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate
COPY package.json pnpm-lock.yaml ./
COPY scripts/ ./scripts/
RUN pnpm install --frozen-lockfile

FROM deps AS build
WORKDIR /app
COPY . .
RUN pnpm run build

FROM deps AS prod-deps
WORKDIR /app
RUN pnpm prune --prod

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY agent-arena-skill ./agent-arena-skill
COPY agent-arena ./agent-arena
COPY .agents/skills ./.agents/skills
COPY ooda/RALPH.md ./ooda/RALPH.md
COPY ooda/goblin.md ./ooda/goblin.md
COPY ooda/minimax.md ./ooda/minimax.md
COPY ooda/kimi.md ./ooda/kimi.md
COPY server/lib/dbc/release_0.1.6.json ./server/lib/dbc/release_0.1.6.json

EXPOSE 8080
CMD ["node", "dist/index.js"]
