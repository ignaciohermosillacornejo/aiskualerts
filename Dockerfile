# ===========================================
# Production Dockerfile for AI SKU Alerts
# ===========================================
# Multi-stage build with Bun runtime

# Stage 1: Build stage
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile --production=false

# Copy source files
COPY . .

# Build CSS with Tailwind
RUN bun run build:css

# Stage 2: Production runtime
FROM oven/bun:1-alpine

WORKDIR /app

# Install 1Password CLI for secret injection
RUN apk add --no-cache curl && \
    curl -sSfLo /tmp/op.zip https://cache.agilebits.com/dist/1P/op2/pkg/v2.34.0/op_linux_amd64_v2.34.0.zip && \
    unzip /tmp/op.zip -d /usr/local/bin && \
    rm /tmp/op.zip && \
    apk del curl

# Copy built assets from builder
COPY --from=builder /app/src/frontend/styles/output.css /app/src/frontend/styles/output.css
COPY --from=builder /app/node_modules /app/node_modules

# Copy source code
COPY src ./src
COPY package.json ./

# Copy environment template
COPY .env.tpl ./

# Create non-root user
RUN addgroup -g 1001 -S bun && \
    adduser -S bun -u 1001

# Set ownership
RUN chown -R bun:bun /app

USER bun

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD bun run -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1))"

# Start server (secrets injected at runtime via op run)
CMD ["bun", "src/server.ts"]
