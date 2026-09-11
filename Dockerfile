FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install system dependencies for SQLite
RUN apk add --no-cache \
    sqlite \
    python3 \
    make \
    g++

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Create data directory for persistent storage
RUN mkdir -p /data/.diren

# Create non-root user
RUN addgroup -g 1001 -S diren && \
    adduser -S diren -u 1001

# Set proper permissions
RUN chown -R diren:diren /app /data

# Switch to non-root user
USER diren

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV DIREN_PORT=3000
ENV HOME=/data

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start the application
CMD ["npm", "start"]