# Railway Fallback Dockerfile (Cache Mount 없이)
# syntax=docker/dockerfile:1
# --- Build stage -----------------------------------------------------------
FROM node:20-bullseye AS builder

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci --no-audit

# Copy source files
COPY tsconfig.json ./
COPY src ./src
COPY public ./public

# Build
RUN npm run build

# --- Runtime stage --------------------------------------------------------
FROM node:20-alpine AS runtime

# Security: create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

ENV NODE_ENV=production
WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev --no-audit && \
    npm cache clean --force

# Copy build artifacts and static assets
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/public ./public

# Switch to non-root user
USER nodejs

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8080/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })" || exit 1

CMD ["node", "dist/main.js"]