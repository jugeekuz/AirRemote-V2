# Build context: repository root (see docker-compose.yml).

FROM node:24-slim AS build
RUN npm install -g pnpm@10.33.0
WORKDIR /repo

# Install dependencies first so this layer is cached until a manifest changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY backend backend
COPY packages packages
RUN pnpm --filter @airremote/db --filter @airremote/backend build
RUN pnpm --filter @airremote/backend deploy --prod --legacy /out/backend

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/backend backend
COPY --from=build /repo/packages/db/dist db/dist
COPY --from=build /repo/packages/db/migrations db/migrations
USER node
EXPOSE 3000
CMD ["node", "backend/dist/server.js"]
