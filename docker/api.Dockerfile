# syntax=docker/dockerfile:1

# --- dependencies (production only) ----------------------------------------
FROM node:26-alpine AS deps
WORKDIR /app
# Copy manifests first for better layer caching.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/dashboard/package.json apps/dashboard/package.json
RUN npm ci --omit=dev -w @ai-orchestrator/api --include-workspace-root

# --- runtime ---------------------------------------------------------------
FROM node:26-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app && apk add --no-cache su-exec

COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Files copied from the build context may lack world-read perms (e.g. an exFAT
# source drive); ensure the non-root runtime user can read what it runs.
# Pre-create the request-archive dir owned by `app` so a freshly-mounted named
# volume inherits writable ownership.
RUN chmod -R a+rX /app/apps /app/packages /app/package.json /app/tsconfig.base.json \
  && mkdir -p /data/archive && chown -R app:app /data

EXPOSE 11435

# Start as root ONLY to fix ownership of the mounted archive volume — a named
# volume mounts root-owned (even pre-existing ones), which would silently break
# the request archive for the non-root process — then drop to `app` via su-exec.
CMD ["sh", "-c", "chown -R app:app /data 2>/dev/null || true; exec su-exec app sh -c 'node_modules/.bin/tsx apps/api/src/db/migrate.ts && node_modules/.bin/tsx apps/api/src/server.ts'"]
