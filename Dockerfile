# ZephyrStream Dockerfile
# Multi-stage build: build the Next.js app, then create a lean production image

# === Stage 1: Build ===
FROM oven/bun:latest AS builder

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and install dependencies
COPY package.json ./
COPY bun.lock* ./
RUN bun install

# Copy source code
COPY . .

# Generate Prisma client
RUN bun run db:generate

# Build the Next.js app
RUN bun run build

# Install realtime service dependencies
RUN cd /app/mini-services/realtime && bun install

# === Stage 2: Production ===
FROM oven/bun:latest AS runner

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    sqlite3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Ookla Speedtest CLI (optional — build continues if download fails)
RUN curl -fsSL https://install.speedtest.net/app/cli/ookla-speedtest-1.2.0-linux-x86_64.tgz -o /tmp/speedtest.tgz && \
    tar xzf /tmp/speedtest.tgz -C /usr/local/bin speedtest && \
    rm -f /tmp/speedtest.tgz && \
    chmod +x /usr/local/bin/speedtest || \
    echo "WARNING: Ookla Speedtest CLI download failed — speed test will use Cloudflare fallback"

# Copy built standalone app.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma files (needed for DB access at runtime + db:push migration)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

# Copy mini-services (realtime service)
COPY --from=builder /app/mini-services ./mini-services

# Install realtime service dependencies in the runner stage too
RUN cd /app/mini-services/realtime && bun install

# Copy entrypoint script
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Create directories for data
RUN mkdir -p /app/db /app/public/uploads /app/logs/streams /app/backups

# Set environment
ENV NODE_ENV=production
ENV DATABASE_URL=file:/app/db/custom.db
ENV UPLOAD_DIR=/app/public/uploads
ENV STREAM_LOG_DIR=/app/logs/streams
ENV PORT=3000

# Expose ports
EXPOSE 3000 3003

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:3000/api/system/time || exit 1

# Use entrypoint script (runs DB migration + starts both services)
ENTRYPOINT ["/app/docker-entrypoint.sh"]
