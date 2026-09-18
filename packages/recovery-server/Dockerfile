FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .husky/install.mjs .husky/install.mjs
COPY packages/app/package.json packages/app/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/recovery-server/package.json packages/recovery-server/package.json

# corepack derives the pnpm version from "packageManager" in package.json
RUN corepack enable && corepack install

RUN pnpm install --frozen-lockfile --filter @budget/recovery-server...

FROM deps AS build

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/core packages/core
COPY packages/recovery-server packages/recovery-server

# Build shared first, then core, so declarations are available for the recovery-server typecheck
# Clean tsbuildinfo to prevent incremental build issues (TypeScript skips JS emission
# when tsbuildinfo indicates no changes, causing MODULE_NOT_FOUND at runtime)
RUN rm -f packages/shared/tsconfig.tsbuildinfo packages/core/tsconfig.tsbuildinfo packages/recovery-server/tsconfig.tsbuildinfo

# Build shared first, then core, so declarations are available for the recovery-server typecheck
RUN pnpm --filter @budget/shared run build
RUN pnpm --filter @budget/core run build
RUN pnpm --filter @budget/recovery-server run build

FROM node:22-alpine AS runtime

WORKDIR /app

RUN addgroup -S appuser && adduser -S appuser -G appuser

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001

# Copy only what the recovery server needs at runtime — no other package manifests
COPY --from=deps /app/node_modules node_modules
COPY --from=deps /app/packages/recovery-server/node_modules packages/recovery-server/node_modules
COPY packages/recovery-server/package.json packages/recovery-server/package.json
COPY --from=build /app/packages/recovery-server/dist packages/recovery-server/dist
COPY packages/recovery-server/drizzle packages/recovery-server/drizzle
COPY packages/recovery-server/drizzle.config.ts packages/recovery-server/drizzle.config.ts

EXPOSE 3001

USER appuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1

CMD ["node", "packages/recovery-server/dist/main.js"]