# Production Dockerfile (Dev-Rules: Production mit Dockerfile)
# Stage 1: Build
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Laufzeit ohne Dev-Dependencies/Build-Tools
FROM node:20-alpine
WORKDIR /app
RUN apk update && apk upgrade --no-cache
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

# Kein root im Produktions-Image (siehe deployment.mdc).
RUN addgroup -S app && adduser -S app -G app
USER app

EXPOSE 6055
CMD ["node", "dist/src/main.js"]
