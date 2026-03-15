# ================================
# 🚀 Sseudam BullMQ Dashboard Docker Image
# ================================

FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies
COPY dashboard-package.json package.json
RUN npm install --only=production --silent

# Copy dashboard application
COPY standalone-dashboard.js .

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S dashboard -u 1001

# Switch to non-root user
USER dashboard

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start application
CMD ["npm", "start"]