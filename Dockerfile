# syntax=docker/dockerfile:1
# --- Build stage -----------------------------------------------------------
FROM --platform=$BUILDPLATFORM node:20-bullseye AS builder

# Enable BuildKit inline cache
ARG BUILDKIT_INLINE_CACHE=1

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./

# Use npm ci with cache mount for better performance
RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefer-offline --no-audit

# Copy source files
COPY tsconfig.json ./
COPY src ./src
COPY public ./public

# Build with cache mount
RUN --mount=type=cache,target=node_modules/.cache \
    npm run build

# --- Runtime stage --------------------------------------------------------
FROM node:20-alpine AS runtime

# Security: create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

ENV NODE_ENV=production
WORKDIR /app

# Install only production dependencies with cache
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --prefer-offline --no-audit && \
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
