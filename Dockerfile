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
# Don't use --frozen-lockfile because the bun.lock in the repo may use
# a different lockfile version than the bun version in this image.
# bun install without --frozen-lockfile will resolve and install correctly.
COPY package.json ./
COPY bun.lock* ./
RUN bun install

# Copy source code
COPY . .

# Generate Prisma client
RUN bun run db:generate

# Build the Next.js app
RUN bun run build

# === Stage 2: Production ===
FROM oven/bun:latest AS runner

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    sqlite3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Ookla Speedtest CLI
RUN curl -sL https://install.speedtest.net/app/cli/ookla-speedtest-1.2.0-linux-x86_64.tgz | tar xz -C /usr/local/bin speedtest

# Copy built standalone app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma files
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy mini-services
COPY --from=builder /app/mini-services ./mini-services

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
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/system/time || exit 1

# Start both the main app and the realtime service
# The realtime service runs as a background process
CMD bash -c "cd /app/mini-services/realtime && bun run dev & \
  cd /app && bun .next/standalone/server.js"
