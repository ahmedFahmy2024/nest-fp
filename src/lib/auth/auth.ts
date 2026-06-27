import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaClient } from '../../generated/prisma';

// Single PrismaClient instance for Better Auth.
// NestJS's PrismaService is only available inside the DI container,
// so we create a standalone client here that Better Auth owns.
const prisma = new PrismaClient();

export const auth = betterAuth({
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
        required: true,
        input: false,
      },
    },
  },
});
