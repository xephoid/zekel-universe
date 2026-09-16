# Builds the zekel board-game engine from its own checkout.
# Referenced from docker-compose.yml with build context ../zekel, so every
# path below is relative to the engine repo root, not to this repo.

FROM node:22-alpine AS build
WORKDIR /app

# pnpm is the engine's package manager (see the engine repo's AGENTS.md).
RUN corepack enable && corepack prepare pnpm@10 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
# Compiles TypeScript to dist/ and copies the lore markdown assets.
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@10 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/dist ./dist

# Runtime settings come from docker-compose env (MCP_TRANSPORT=http, PORT=8787,
# MCP_BEARER_TOKEN, SESSION_STORE=sqlite, SESSION_DB_PATH=/data/sessions.db).
EXPOSE 8787
CMD ["node", "dist/index.js"]
