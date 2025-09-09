# syntax=docker/dockerfile:1.7-labs

FROM node:20-alpine AS base
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# ---------------------------
# deps
# ---------------------------
FROM base AS deps
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-lock.yaml* ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---------------------------
# build
# ---------------------------
FROM base AS builder
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN pnpm run build
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm prune --prod

# ---------------------------
# runtime (prod)
# ---------------------------
FROM node:20-alpine AS runner
USER node
ENV PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --chown=node:node --from=builder /app/.next/standalone ./
COPY --chown=node:node --from=builder /app/.next/static ./.next/static
COPY --chown=node:node --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]

# ---------------------------
# dev (для next dev)
# ---------------------------
FROM base AS dev
ENV NODE_ENV=development
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-lock.yaml* ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install
COPY . .
EXPOSE 3000
# команду переопределяем в compose: ["pnpm","dev"]
