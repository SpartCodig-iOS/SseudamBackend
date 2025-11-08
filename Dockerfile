# --- Build stage -----------------------------------------------------------
FROM node:20-bullseye AS builder
WORKDIR /app

# Install dependencies (npm ci preferred if lockfile present)
COPY package*.json ./
RUN npm install

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
COPY public ./public
COPY swagger.js ./
COPY swagger-output.json ./
RUN npm run build

# --- Runtime stage --------------------------------------------------------
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Copy package files and install only production deps
COPY package*.json ./
RUN npm install --omit=dev

# Copy built artifacts from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/swagger-output.json ./

EXPOSE 8080
CMD ["node", "dist/server.js"]
