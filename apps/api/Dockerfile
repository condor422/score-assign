# Cloud Run image for the API. Built from the repo root so the shared
# workspace package is available:
#   docker build -f apps/api/Dockerfile .
FROM node:20-slim AS build
WORKDIR /app

# argon2 is a native module and needs a toolchain to build.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --workspace @score-assign/shared --workspace @score-assign/api --include-workspace-root

COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build --workspace @score-assign/shared \
  && npm run build --workspace @score-assign/api \
  && npm prune --omit=dev

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json package.json
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist

USER node
# Cloud Run injects PORT; config defaults to 8080 to match.
EXPOSE 8080
CMD ["node", "apps/api/dist/server.js"]
