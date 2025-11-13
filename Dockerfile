# --- Build stage -----------------------------------------------------------
FROM node:20-bullseye AS builder
WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci

# Copy source
COPY tsconfig.json ./
COPY src ./src
COPY public ./public

RUN npm run build

# --- Runtime stage --------------------------------------------------------
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Install only production deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy build artifacts and static assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

EXPOSE 8080
CMD ["node", "dist/main.js"]
