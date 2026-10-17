# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* && corepack enable
COPY . .
RUN yarn workspaces focus @photo-contest/api
RUN yarn workspace @photo-contest/api db:generate \
    && yarn workspace @photo-contest/api build \
    && yarn workspaces focus @photo-contest/api --production

FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /var/lib/photo-contest/media && chown -R node:node /var/lib/photo-contest
WORKDIR /app/projects/photo-contest/apps/api
ENV NODE_ENV=production API_HOST=0.0.0.0 PORT=4200
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/projects/photo-contest/apps/api/package.json ./package.json
COPY --from=build /app/projects/photo-contest/apps/api/dist ./dist
COPY --from=build /app/projects/photo-contest/apps/api/src ./src
COPY --from=build /app/projects/photo-contest/apps/api/prisma ./prisma
COPY --from=build /app/projects/photo-contest/apps/api/generated ./generated
USER node
EXPOSE 4200
CMD ["node", "dist/main.js"]
