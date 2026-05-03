# --- build stage ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# --- runtime stage ---
FROM nginx:alpine
ARG COOLIFY_URL=https://jonathanwrede.de
ARG COOLIFY_FQDN=jonathanwrede.de
ARG COOLIFY_BRANCH=main
ARG COOLIFY_RESOURCE_UUID=hkss80kg8os800kgkg480w0k
COPY --from=build /app/dist /usr/share/nginx/html
