FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/server/package.json packages/server/
COPY packages/cli/package.json packages/cli/
COPY packages/mcp-stdio/package.json packages/mcp-stdio/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile

# Build
FROM deps AS build
ARG VITE_FORMSPREE_URL
ENV VITE_FORMSPREE_URL=$VITE_FORMSPREE_URL
ARG VITE_GOOGLE_OAUTH_INVITE_ONLY
ENV VITE_GOOGLE_OAUTH_INVITE_ONLY=$VITE_GOOGLE_OAUTH_INVITE_ONLY
COPY tsconfig.base.json ./
COPY packages/ packages/
RUN pnpm build

# Production
FROM base AS production
COPY --from=deps /app/node_modules node_modules
COPY --from=deps /app/packages/server/node_modules packages/server/node_modules
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/server/package.json packages/server/
COPY --from=build /app/packages/web/dist packages/web/dist
COPY --from=build /app/packages/cli/dist packages/cli/dist
COPY --from=build /app/packages/cli/package.json packages/cli/
COPY --from=deps /app/packages/cli/node_modules packages/cli/node_modules

ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/agentcloak.db

EXPOSE 3000

CMD ["node", "packages/server/dist/index.js"]
