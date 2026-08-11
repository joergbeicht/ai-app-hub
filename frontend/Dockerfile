# Production Dockerfile (Dev-Rules: Production mit Dockerfile)
# Stage 1: Build
FROM node:20-alpine AS build
WORKDIR /app

# Real SemVer from git tag / CI – no package.json fake version.
ARG APP_VERSION
ENV APP_VERSION=${APP_VERSION}
RUN test -n "$APP_VERSION" || (echo "ERROR: Build arg APP_VERSION is required (git tag / CI)." && exit 1)

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN npm run build

# Stage 2: Serve mit nginx
FROM nginx:alpine
# Patch known-fixed CVEs in base OS packages (curl/openssl/libxml2 etc.) - the Trivy-Scan-Schritt
# in der CI (frontend-ci.yml) blockiert sonst auf bereits behobene Alpine-Package-CVEs.
RUN apk update && apk upgrade --no-cache
COPY --from=build /app/dist/app-hub-frontend /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Renders runtime-config.json from env vars at container start (cluster name, Azure tenant/client ID)
# – see docker-entrypoint.d/20-generate-runtime-config.sh. nginx's own entrypoint runs it automatically.
COPY docker/docker-entrypoint.d/20-generate-runtime-config.sh /docker-entrypoint.d/20-generate-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/20-generate-runtime-config.sh
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
