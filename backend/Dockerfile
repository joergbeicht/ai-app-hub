# Production Dockerfile (Dev-Rules: Production mit Dockerfile)
# Stage 1: Build
FROM node:26-alpine AS build
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

# Stage 2: Laufzeit ohne Dev-Dependencies/Build-Tools
FROM node:26-alpine
WORKDIR /app
RUN apk update && apk upgrade --no-cache

# postgresql-client für pg_isready im Entrypoint (siehe ADR-17: erste eigene DB dieses Backends).
RUN apk add --no-cache postgresql-client

ENV NODE_ENV=production

COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci --omit=dev
RUN npx prisma generate

COPY --from=build /app/dist ./dist

COPY docker-entrypoint.prod.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Kein root im Produktions-Image (siehe deployment.mdc).
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

EXPOSE 6055
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/src/main.js"]
