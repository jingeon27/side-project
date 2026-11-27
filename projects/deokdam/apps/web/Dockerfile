# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 YARN_ENABLE_IMMUTABLE_INSTALLS=true DEOKDAM_STANDALONE=1
ARG NEXT_PUBLIC_DEOKDAM_AMPLITUDE_KEY=
ENV NEXT_PUBLIC_DEOKDAM_AMPLITUDE_KEY=${NEXT_PUBLIC_DEOKDAM_AMPLITUDE_KEY}
RUN npm install --global @yarnpkg/cli-dist@4.17.0 --force
COPY . .
RUN yarn workspaces focus @deokdam/web
RUN yarn workspace @deokdam/web build

FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3460
COPY --from=build --chown=node:node /app/projects/deokdam/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/projects/deokdam/apps/web/.next/static ./projects/deokdam/apps/web/.next/static
COPY --from=build --chown=node:node /app/projects/deokdam/apps/web/public ./projects/deokdam/apps/web/public
RUN mkdir -p /var/lib/deokdam/reading /var/lib/deokdam/orders \
    && chown node:node /var/lib/deokdam/reading /var/lib/deokdam/orders
USER node
EXPOSE 3460
CMD ["node", "projects/deokdam/apps/web/server.js"]
