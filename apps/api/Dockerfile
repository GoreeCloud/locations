FROM docker.io/library/node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev --workspace=@goreecloud/locations-api --include-workspace-root=false
COPY apps/api/src/ ./apps/api/src/
COPY migrations/ ./migrations/
USER node
EXPOSE 8787
CMD ["node", "apps/api/src/server.mjs"]
