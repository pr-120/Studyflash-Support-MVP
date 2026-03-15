# ── Stage 1: Install dependencies ──
# Only re-runs when package.json or package-lock.json change.
FROM node:20-alpine AS deps
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: Generate Prisma client ──
# Only re-runs when the schema changes.
FROM node:20-alpine AS prisma
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma
RUN npx prisma generate

# ── Stage 3: Build the Next.js application ──
# Re-runs when source code changes, but deps + prisma are cached.
FROM node:20-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=prisma /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=prisma /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Copy only what the build needs (not tickets, scripts, docs)
COPY src ./src
COPY public ./public
COPY prisma ./prisma
COPY next.config.js tsconfig.json tailwind.config.ts postcss.config.js package.json ./

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Stage 4: Production image ──
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma (needed for db push + seed at runtime)
COPY --from=prisma /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=deps /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=deps /app/node_modules/prisma ./node_modules/prisma
COPY prisma ./prisma

# Copy seed runtime: scripts + tsx + ticket data
# These layers rarely change and are cached independently of source code.
COPY --from=deps /app/node_modules/tsx ./node_modules/tsx
COPY --from=deps /app/node_modules/esbuild ./node_modules/esbuild
COPY --from=deps /app/node_modules/@esbuild ./node_modules/@esbuild
COPY --from=deps /app/node_modules/get-tsconfig ./node_modules/get-tsconfig
COPY --from=deps /app/node_modules/resolve-pkg-maps ./node_modules/resolve-pkg-maps
COPY --from=deps /app/node_modules/franc ./node_modules/franc
COPY --from=deps /app/node_modules/trigram-utils ./node_modules/trigram-utils
COPY --from=deps /app/node_modules/n-gram ./node_modules/n-gram
COPY --from=deps /app/node_modules/collapse-white-space ./node_modules/collapse-white-space
COPY --from=deps /app/node_modules/clsx ./node_modules/clsx
COPY --from=deps /app/node_modules/tailwind-merge ./node_modules/tailwind-merge
COPY scripts ./scripts
COPY src/lib/classify.ts ./src/lib/classify.ts
COPY src/lib/utils.ts ./src/lib/utils.ts
COPY tickets ./tickets

# Fix permissions for prisma db push
RUN chown -R nextjs:nodejs node_modules/@prisma node_modules/.prisma node_modules/prisma

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
