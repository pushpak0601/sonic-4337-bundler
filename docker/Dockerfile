FROM node:18-alpine
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install ALL dependencies (including dev) for building
RUN npm ci

# Copy source code
COPY src ./src
COPY config ./config
COPY .env.example ./

# Build TypeScript
RUN npm run build

# Clean up: remove dev dependencies after build
RUN npm prune --production

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    mkdir -p /app/logs && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose ports
EXPOSE 3000 9091

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start command
CMD ["node", "dist/index.js"]
