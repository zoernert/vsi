FROM node:18-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S vsi -u 1001

# Copy package files
COPY package*.json ./

# Install dependencies (including new database packages)
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY --chown=vsi:nodejs . .

# Create necessary directories
RUN mkdir -p uploads data && chown -R vsi:nodejs uploads data

# Switch to non-root user
USER vsi

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/auth/debug/users || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["npm", "start"]
