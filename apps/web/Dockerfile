FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci --workspace=@goreecloud/locations-web --include-workspace-root=false
COPY apps/web/ ./apps/web/
COPY vendor/gc-ui/ ./vendor/gc-ui/
RUN npm run build -w @goreecloud/locations-web
FROM nginx:1.29-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist/ /usr/share/nginx/html/
EXPOSE 80
