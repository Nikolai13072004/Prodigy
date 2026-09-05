FROM node:20.20-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:20.20-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20.20-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 AS runner
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl libreoffice-impress poppler-utils python3 unzip fonts-crosextra-carlito fonts-crosextra-caladea fonts-dejavu-core fonts-liberation fonts-noto-core fonts-noto-cjk \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN groupadd --system nextjs && useradd --system --gid nextjs nextjs

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
  && mkdir -p /app/data /app/data/uploads /app/public/branding \
  && chown -R nextjs:nextjs /app

EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
# Схема применяется через `prisma migrate deploy` (ADR-014). База — PostgreSQL
# с чистой историей миграций (baseline `*_init_postgres`), поэтому P3005 из
# ADR-010 больше не возникает. `db:wal` убран — он был SQLite-специфичен.
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start -- -p 3000 -H 0.0.0.0"]
