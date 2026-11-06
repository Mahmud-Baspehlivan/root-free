# Build the browser app with Vite.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts ./
COPY web ./web
RUN npm run build

# Run the server. Node runs the TypeScript directly, so there is no server build.
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/rootfree.db \
    PUBLIC_DIR=/app/dist
COPY package.json ./
COPY server ./server
COPY --from=build /app/dist ./dist
# The SQLite database lives in /data: mount a persistent volume there.
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/server.ts"]
