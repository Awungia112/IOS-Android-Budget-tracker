FROM node:22-alpine AS deps

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .husky/install.mjs .husky/install.mjs
COPY packages/app/package.json packages/app/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/server/package.json packages/server/package.json

RUN pnpm install --frozen-lockfile --filter @budget/server...

FROM deps AS build

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/core packages/core
COPY packages/server packages/server

# Clean tsbuildinfo to prevent incremental build issues (TypeScript skips JS emission
# when tsbuildinfo indicates no changes, causing MODULE_NOT_FOUND at runtime)
RUN rm -f packages/shared/tsconfig.tsbuildinfo packages/core/tsconfig.tsbuildinfo packages/server/tsconfig.tsbuildinfo

RUN pnpm --filter @budget/shared run build
RUN pnpm --filter @budget/core run build
RUN pnpm --filter @budget/server run build

FROM node:22-alpine AS runtime

WORKDIR /app

RUN addgroup -S appuser && adduser -S appuser -G appuser

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY --from=deps /app/node_modules node_modules
COPY --from=deps /app/packages/server/node_modules packages/server/node_modules
COPY packages/server/package.json packages/server/package.json
COPY --from=build /app/packages/shared packages/shared
COPY --from=build /app/packages/core packages/core
COPY --from=build /app/packages/server/dist packages/server/dist
COPY packages/server/drizzle packages/server/drizzle
COPY packages/server/drizzle.config.ts packages/server/drizzle.config.ts

EXPOSE 3000

USER appuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "packages/server/dist/main.js"]
