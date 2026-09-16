# Builds the Universe pnpm workspace: apps/web static files plus the
# apps/server API, both served by the server process.
# Build context is the repo root (see infra/docker-compose.yml).

FROM node:22-alpine AS build
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps

RUN pnpm install --frozen-lockfile
# Builds apps/web to apps/web/dist (vite build) and apps/server to
# apps/server/dist (tsc). Each package owns its own build script.
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/server/package.json ./apps/server/package.json

# Install the server's production deps only. The engine client is a
# workspace package, so it comes along as source.
RUN pnpm install --frozen-lockfile --prod

COPY packages ./packages
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist

EXPOSE 8788
CMD ["node", "apps/server/dist/index.js"]
