# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Dependencies + build
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Prisma needs OpenSSL on Alpine.
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src

RUN npx prisma generate
RUN npm run build

# ---------------------------------------------------------------------------
# Runtime
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production

# The full dependency tree is kept on purpose: Prisma CLI runs migrations on
# boot and tsx stays available so `docker compose exec backend npm run db:seed`
# works for reviewers. The footprint is acceptable for this demo deployment.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src ./src
COPY package*.json tsconfig.json ./

EXPOSE 5000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
