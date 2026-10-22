# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS build
WORKDIR /app
ENV YARN_ENABLE_IMMUTABLE_INSTALLS=true
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* && corepack enable
COPY . .
RUN yarn workspaces focus @photo-contest/web
RUN yarn workspace @photo-contest/api db:generate
ENV NEXT_TELEMETRY_DISABLED=1 API_URL=http://api:4200
ARG WEB_ORIGIN=https://photo-contest.test
ARG NEXT_PUBLIC_SENTRY_DSN=
ARG NEXT_PUBLIC_AMPLITUDE_API_KEY=
ENV WEB_ORIGIN=${WEB_ORIGIN} NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN} NEXT_PUBLIC_AMPLITUDE_API_KEY=${NEXT_PUBLIC_AMPLITUDE_API_KEY}
RUN --mount=type=cache,id=pc-next-cache,target=/app/projects/photo-contest/apps/web/.next/cache \
    yarn workspace @photo-contest/web codegen \
    && mkdir -p projects/photo-contest/apps/web/public \
    && yarn workspace @photo-contest/web build

FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3200
COPY --from=build --chown=node:node /app/projects/photo-contest/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/projects/photo-contest/apps/web/.next/static ./projects/photo-contest/apps/web/.next/static
COPY --from=build --chown=node:node /app/projects/photo-contest/apps/web/public ./projects/photo-contest/apps/web/public
USER node
EXPOSE 3200
CMD ["node", "projects/photo-contest/apps/web/server.js"]
