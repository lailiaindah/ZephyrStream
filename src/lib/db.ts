import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Only log queries in development IF explicitly enabled via env var.
// Default: only log errors + warnings (not every query) to prevent
// dev.log / server.log from bloating with SQL query output.
const queryLogEnabled = process.env.PRISMA_LOG_QUERIES === 'true'

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: queryLogEnabled
      ? ['query', 'error', 'warn']
      : ['error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
