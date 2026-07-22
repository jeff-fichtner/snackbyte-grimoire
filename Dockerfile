# Grimoire — one combined always-on service: the HTTP surface and the bundled web surface.

FROM node:24-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json vite.config.ts ./
COPY src ./src
# The server compiles to dist/server; the web surface bundles to dist/.
RUN npx tsc -p tsconfig.build.json && npx vite build

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# Cloud Run injects PORT; the app reads it and refuses to start without it.
EXPOSE 8080
CMD ["node", "dist/server/main.js"]
