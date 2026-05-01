# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS deps

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

ARG PRISMA_GENERATE_DATABASE_URL="postgresql://user:password@localhost:5432/database"

COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

RUN DATABASE_URL="${PRISMA_GENERATE_DATABASE_URL}" npm ci

FROM deps AS build

COPY tsconfig.json ./
COPY src ./src

RUN npm run build \
  && npm prune --omit=dev \
  && npm cache clean --force

FROM node:24-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY docker-entrypoint.sh ./

RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3001

CMD ["./docker-entrypoint.sh"]
