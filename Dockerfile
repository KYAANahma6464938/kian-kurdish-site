# ─── KIAN AI — production image ──────────────────────────────────
# Build : docker build -t kian-ai .
# Run   : docker compose up -d   (recommended — see DEPLOY.md)

# ── Stage 1: install + build (Bun) ──────────────────────────────
FROM oven/bun:1 AS builder
WORKDIR /app

# PrismaClient is instantiated at module scope during the Next build,
# so a placeholder DATABASE_URL must exist at build time.
ENV DATABASE_URL=file:/tmp/build.db
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY prisma ./prisma
RUN bunx prisma generate

COPY . .
RUN bun run build

# ── Stage 2: runtime (Node — maximum Next standalone compatibility) ──
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL=file:/app/db/custom.db

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Prisma CLI + engine for the startup schema sync (db push)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.bin ./node_modules/.bin

RUN mkdir -p /app/db
VOLUME /app/db

EXPOSE 3000

# Sync the SQLite schema (idempotent, instant when already synced), then start.
CMD ["sh", "-c", "./node_modules/.bin/prisma db push --skip-generate --accept-data-loss && node server.js"]
