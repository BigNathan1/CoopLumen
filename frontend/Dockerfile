# ── builder: full deps + Next.js build ────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_STELLAR_NETWORK=TESTNET
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_STELLAR_NETWORK=$NEXT_PUBLIC_STELLAR_NETWORK
RUN npm run build

# ── dev: hot-reload server (used by docker-compose in development) ─────────────
FROM node:20-alpine AS dev
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ── production: minimal standalone Next.js image ───────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# next build --standalone emits a self-contained server.js with all deps inlined
COPY --from=builder --chown=node:node /app/public              ./public
COPY --from=builder --chown=node:node /app/.next/standalone    ./
COPY --from=builder --chown=node:node /app/.next/static        ./.next/static

USER node
EXPOSE 3000
CMD ["node", "server.js"]
