# ===========================================
# Production Dockerfile for AI SKU Alerts
# ===========================================
# Multi-stage build with Bun runtime

# Stage 1: Build stage
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies (including devDependencies for build)
RUN bun install --frozen-lockfile

# Copy source files
COPY . .

# Build CSS with Tailwind (if script exists, for Phase 5+)
RUN bun run build:css || echo "No CSS build needed yet"

# Stage 2: Production runtime
FROM oven/bun:1-alpine

WORKDIR /app

# Copy built assets from builder
COPY --from=builder /app/src/frontend/styles/output.css /app/src/frontend/styles/output.css
COPY --from=builder /app/node_modules /app/node_modules

# Copy source code and config files
COPY src ./src
COPY package.json ./
COPY tsconfig.json ./

# The bun user already exists in oven/bun:1-alpine base image
# Set ownership to bun user
RUN chown -R bun:bun /app

USER bun

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD bun run -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1))"

# Start server (secrets loaded from .env via docker-compose)
CMD ["bun", "src/server.ts"]
