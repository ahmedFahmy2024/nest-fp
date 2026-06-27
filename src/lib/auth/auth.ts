import 'dotenv/config';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Single PrismaClient instance for Better Auth.
// NestJS's PrismaService is only available inside the DI container,
// so we create a standalone client here that Better Auth owns.
//
// Prisma 7 removed the built-in query engine: PrismaClient no longer reads
// DATABASE_URL by itself and must be given a "driver adapter" that owns the
// actual database connection. For PostgreSQL that's PrismaPg (backed by `pg`).
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,

  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),

  emailAndPassword: {
    enabled: true,
  },

  user: {
    additionalFields: {
      // Expose role in the session user object.
      // input: false prevents clients from supplying this field during sign-up.
      // The DB column defaults to PARTICIPANT, so no explicit defaultValue needed here.
      role: {
        type: ['PARTICIPANT', 'ADMIN'] as const,
        input: false,
      },
    },
  },
});
