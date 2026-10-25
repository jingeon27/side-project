# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS base
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable && corepack prepare yarn@4.17.0 --activate
WORKDIR /app

FROM base AS build
COPY . .
RUN YARN_ENABLE_IMMUTABLE_INSTALLS=true corepack yarn workspaces focus @game-feedback/api @game-feedback/web
RUN corepack yarn workspace @game-feedback/contracts build \
    && corepack yarn workspace @game-feedback/api db:generate \
    && corepack yarn workspace @game-feedback/api openapi \
    && corepack yarn workspace @game-feedback/sdk codegen

FROM build AS api-build
RUN corepack yarn workspace @game-feedback/api build \
    && YARN_ENABLE_IMMUTABLE_INSTALLS=true corepack yarn workspaces focus @game-feedback/api --production

FROM build AS web-build
ARG NEXT_PUBLIC_SENTRY_DSN=
ARG NEXT_PUBLIC_AMPLITUDE_API_KEY=
ARG SENTRY_RELEASE=
ENV NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN} NEXT_PUBLIC_AMPLITUDE_API_KEY=${NEXT_PUBLIC_AMPLITUDE_API_KEY}
ENV SENTRY_RELEASE=${SENTRY_RELEASE}
ARG WEB_ORIGIN=https://preview.invalid
ARG GAME_FEEDBACK_CONTACT_EMAIL=operator@example.invalid
ENV NODE_ENV=production ENVIRONMENT=production NEXT_TELEMETRY_DISABLED=1 \
    GAME_FEEDBACK_API_URL=http://api:4300 \
    WEB_ORIGIN=${WEB_ORIGIN} \
    GAME_FEEDBACK_CONTACT_EMAIL=${GAME_FEEDBACK_CONTACT_EMAIL}
RUN --mount=type=cache,id=gf-next-cache,target=/app/projects/game-feedback/apps/web/.next/cache \
    mkdir -p projects/game-feedback/apps/web/public \
    && corepack yarn workspace @game-feedback/web build

FROM base AS api
ENV NODE_ENV=production ENVIRONMENT=production
COPY --from=api-build /app/node_modules ./node_modules
COPY --from=api-build /app/package.json ./package.json
COPY --from=api-build /app/packages/push-notifications ./packages/push-notifications
COPY --from=api-build /app/projects/game-feedback/packages/contracts ./projects/game-feedback/packages/contracts
COPY --from=api-build /app/projects/game-feedback/apps/api/package.json ./projects/game-feedback/apps/api/package.json
COPY --from=api-build /app/projects/game-feedback/apps/api/dist ./projects/game-feedback/apps/api/dist
COPY --from=api-build /app/projects/game-feedback/apps/api/scripts ./projects/game-feedback/apps/api/scripts
COPY --from=api-build /app/projects/game-feedback/apps/api/prisma ./projects/game-feedback/apps/api/prisma
COPY --from=api-build /app/projects/game-feedback/apps/api/prisma.config.ts ./projects/game-feedback/apps/api/prisma.config.ts
WORKDIR /app/projects/game-feedback/apps/api
RUN mkdir -p /app/projects/game-feedback/.data && chown node:node /app/projects/game-feedback/.data
USER node
EXPOSE 4300
CMD ["node", "dist/main.js"]

FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS web
ENV NODE_ENV=production ENVIRONMENT=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3300
WORKDIR /app
COPY --from=web-build --chown=node:node /app/projects/game-feedback/apps/web/.next/standalone ./
COPY --from=web-build --chown=node:node /app/projects/game-feedback/apps/web/.next/static ./projects/game-feedback/apps/web/.next/static
COPY --from=web-build --chown=node:node /app/projects/game-feedback/apps/web/public ./projects/game-feedback/apps/web/public
RUN mkdir -p /app/projects/game-feedback/.data && chown node:node /app/projects/game-feedback/.data
USER node
EXPOSE 3300
CMD ["node", "projects/game-feedback/apps/web/server.js"]
