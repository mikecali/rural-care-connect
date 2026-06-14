# Stage 1 — build React app
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2 — nginx with TLS
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
# Configs mounted at runtime via docker-compose volumes — no COPY needed
EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]

