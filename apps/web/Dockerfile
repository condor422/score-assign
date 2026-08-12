# Cloud Run image for the SPA. Built from the repo root:
#   docker build -f apps/web/Dockerfile .
FROM node:20-slim AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @score-assign/shared --workspace @score-assign/web --include-workspace-root

COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build --workspace @score-assign/shared && npm run build --workspace @score-assign/web

FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
ENV PORT=8080
EXPOSE 8080
