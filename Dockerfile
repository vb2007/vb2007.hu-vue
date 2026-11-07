# syntax=docker/dockerfile:1

# --- build: compile the Vite app ---------------------------------------------
FROM node:22.22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite inlines VITE_* values at build time, so the API URL has to be a build arg.
ARG VITE_API_BASE_URL
RUN test -n "$VITE_API_BASE_URL" || (echo "VITE_API_BASE_URL build arg is required" >&2; exit 1)
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build-only

# --- runtime: static files behind unprivileged nginx -------------------------
FROM nginxinc/nginx-unprivileged:1.31.6-alpine AS runtime

# Drop the base image's stock pages (50x.html, index.html) so only the build is served.
# They are root-owned, so this needs root before going back to the image's uid 101.
USER root
RUN rm -rf /usr/share/nginx/html
USER 101

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
# Not in conf.d: the base image includes conf.d/*.conf at http level.
COPY docker/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
