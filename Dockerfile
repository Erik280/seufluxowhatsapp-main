# ============================================================
# Dockerfile — SeuFluxo WhatsApp Frontend
# Multi-stage: Build (Node) → Serve (Nginx)
# ============================================================

# ---- Stage 1: Build ----
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (cache layer)
COPY package*.json ./
RUN npm ci --silent

# Copy source and build
COPY . .
RUN npm run build


# ---- Stage 2: Serve ----
FROM nginx:1.27-alpine AS runner

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Custom nginx config for SPA
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy entrypoint script that injects env vars into config.js
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
