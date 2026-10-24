# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS build
WORKDIR /app
ENV YARN_ENABLE_IMMUTABLE_INSTALLS=true
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* && corepack enable
COPY . .
RUN yarn workspaces focus @photo-contest/api
RUN yarn workspace @photo-contest/api db:generate \
    && yarn workspace @photo-contest/api build \
    && yarn workspaces focus @photo-contest/api --production
# 런타임은 dist만 실행하고 src에서는 schema-first GraphQL 파일만 읽는다.
RUN mkdir /app/graphql-schema \
    && cd projects/photo-contest/apps/api \
    && find src -name '*.graphql' -exec cp --parents {} /app/graphql-schema \;

FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/projects/photo-contest/apps/api
ENV NODE_ENV=production API_HOST=0.0.0.0 PORT=4200
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages/push-notifications /app/packages/push-notifications
COPY --from=build /app/projects/photo-contest/apps/api/package.json ./package.json
COPY --from=build /app/projects/photo-contest/apps/api/dist ./dist
COPY --from=build /app/graphql-schema/src ./src
COPY --from=build /app/projects/photo-contest/apps/api/prisma ./prisma
COPY --from=build /app/projects/photo-contest/apps/api/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/projects/photo-contest/apps/api/scripts ./scripts
COPY --from=build /app/projects/photo-contest/apps/api/generated ./generated
USER node
EXPOSE 4200
CMD ["node", "dist/main.js"]
