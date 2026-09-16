# Builds the Universe pnpm workspace: the web app's static files plus the
# server, both served by the server process. Build context is the repo
# root (see infra/docker-compose.yml).

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.19.0 --activate

# Manifests first so the dependency layer caches.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/tokens/package.json packages/tokens/
COPY packages/engine-client/package.json packages/engine-client/
COPY packages/primitives/package.json packages/primitives/
RUN pnpm install --frozen-lockfile

COPY packages ./packages
COPY apps ./apps
# Builds every package to dist/, then apps/web to apps/web/dist (vite) and
# apps/server to apps/server/dist (tsc).
RUN pnpm build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@10.19.0 --activate

# Production dependencies only, with the workspace links intact.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/tokens/package.json packages/tokens/
COPY packages/engine-client/package.json packages/engine-client/
COPY packages/primitives/package.json packages/primitives/
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/tokens/dist packages/tokens/dist
COPY --from=build /app/packages/engine-client/dist packages/engine-client/dist
COPY --from=build /app/packages/primitives/dist packages/primitives/dist
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/web/dist apps/web/dist

EXPOSE 8788
CMD ["node", "apps/server/dist/index.js"]
