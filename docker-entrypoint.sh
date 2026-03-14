#!/bin/sh
set -e

echo "==> Waiting for database..."
# Simple wait loop — try to connect for up to 30 seconds
for i in $(seq 1 30); do
  if node -e "
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    p.\$connect().then(() => { p.\$disconnect(); process.exit(0); }).catch(() => process.exit(1));
  " 2>/dev/null; then
    echo "==> Database is ready"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "==> WARNING: Could not connect to database after 30s, proceeding anyway"
  fi
  sleep 1
done

echo "==> Running Prisma migrations..."
npx prisma db push --skip-generate 2>&1 || echo "==> Prisma push failed (may already be up to date)"

# Seed if DB is empty (check if any tickets exist)
TICKET_COUNT=$(node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.ticket.count().then(c => { console.log(c); p.\$disconnect(); }).catch(() => { console.log('0'); p.\$disconnect(); });
" 2>/dev/null || echo "0")

if [ "$TICKET_COUNT" = "0" ]; then
  echo "==> Database is empty, running seed..."
  npx tsx scripts/seed.ts 2>&1 || echo "==> Seed failed (non-fatal)"
else
  echo "==> Database already has $TICKET_COUNT tickets, skipping seed"
fi

echo "==> Starting Next.js server..."
exec node server.js
