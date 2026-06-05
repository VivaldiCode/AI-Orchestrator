# syntax=docker/dockerfile:1

# --- build the dashboard ---------------------------------------------------
FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/dashboard/package.json apps/dashboard/package.json
RUN npm ci
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/dashboard ./apps/dashboard
RUN npm run build -w @ai-orchestrator/dashboard

# --- serve with nginx ------------------------------------------------------
FROM nginx:alpine AS runtime
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/dashboard/dist /usr/share/nginx/html
COPY apps/landing /usr/share/nginx/html/landing
# Ensure nginx can read context-copied files (exFAT sources may drop read bits).
RUN chmod -R a+rX /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=5s --retries=5 CMD wget -qO- http://localhost/ || exit 1
