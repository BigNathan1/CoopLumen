# deps: production-only dependencies
FROM node:26-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# builder: compile TypeScript
FROM node:26-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# dev: hot-reload server (used by docker-compose in development)
FROM node:26-alpine AS dev
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 4000
CMD ["npm", "run", "dev"]

# production: minimal hardened runtime image
FROM node:26-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

# Copy only compiled output and production node_modules
COPY --from=deps    --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist         ./dist
COPY --chown=node:node package*.json ./

# The runtime only needs node. The package managers bundled with the base image
# are never used here and carry their own advisories into the image scan.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack     /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack     /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*

# Run as the built-in non-root node user
USER node
EXPOSE 4000
CMD ["node", "dist/index.js"]
