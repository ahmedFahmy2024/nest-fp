# Better Auth Integration

## Overview

Authentication is handled by [Better Auth](https://better-auth.com) via the official NestJS integration library [`@thallesp/nestjs-better-auth`](https://github.com/ThallesP/nestjs-better-auth).

**Packages installed:**
- `better-auth` — core auth library
- `@thallesp/nestjs-better-auth` — NestJS adapter (route handler, global guard, decorators)

---

## File Structure

```
src/lib/auth/
  auth.ts        — Better Auth instance (config, Prisma adapter, field rules)
  auth.module.ts — NestJS module that registers BetterAuthModule.forRoot()
```

---

## How It Works

### Auth Instance (`src/lib/auth/auth.ts`)

The `betterAuth(...)` call wires together:

- **Prisma adapter** — reads/writes auth data through a dedicated `PrismaClient` instance (separate from the NestJS DI-managed `PrismaService` because Better Auth owns its own lifecycle)
- **Email + password** — enabled; handles sign-up, sign-in, and password hashing out of the box
- **`user.additionalFields.role`** — exposes the `role` column on the session user object (see [Roles](#roles) below)

### NestJS Module (`src/lib/auth/auth.module.ts`)

`BetterAuthModule.forRoot({ auth })` from `@thallesp/nestjs-better-auth` sets up:

1. **Route handler** — mounts `toNodeHandler(auth)` on every request to `/api/auth/*`, so Better Auth handles its own routing internally
2. **Body-parser skipping** — applies `json()`/`urlencoded()` middleware to all routes *except* `/api/auth/*` (Better Auth parses its own request body)
3. **Global `AuthGuard`** — every route in the application requires a valid session unless explicitly opted out

`main.ts` sets `bodyParser: false` on the NestJS factory so the library can manage parsing itself.

### Route Protection

The global guard runs on every request. To change the behaviour for specific routes, use these decorators imported from `@thallesp/nestjs-better-auth`:

| Decorator | Effect |
|---|---|
| `@AllowAnonymous()` | Route is fully public — no session required |
| `@OptionalAuth()` | Route allows both authenticated and unauthenticated requests |
| `@Session()` | Parameter decorator — injects the current session into a controller method |
| `@Roles(['ADMIN'])` | Restricts route to users whose `role` matches |

Example:

```ts
import { Controller, Get } from '@nestjs/common';
import { AllowAnonymous, Session, UserSession } from '@thallesp/nestjs-better-auth';

@Controller('users')
export class UserController {
  @Get('me')
  getMe(@Session() session: UserSession) {
    return session.user; // { id, name, email, role, ... }
  }

  @Get('ping')
  @AllowAnonymous()
  ping() {
    return 'pong';
  }
}
```

---

## Roles

Users have a `role` field that can be either `PARTICIPANT` (default) or `ADMIN`.

**Rules:**
- The value is stored in the `user` table as a Postgres enum (`Role`)
- It defaults to `PARTICIPANT` at the database level
- `input: false` in `additionalFields` tells Better Auth to strip the field from any sign-up or update payload — clients can never set or change their own role

To promote a user to admin you must update the record directly in the database or through a privileged server-side operation.

**Schema:**

```prisma
enum Role {
  PARTICIPANT
  ADMIN
}

model User {
  // ...
  role Role @default(PARTICIPANT)
}
```

**Auth config:**

```ts
user: {
  additionalFields: {
    role: {
      type: ['PARTICIPANT', 'ADMIN'] as const,
      required: true,
      input: false,
    },
  },
},
```

---

## Auth Endpoints

Better Auth exposes a REST API under `/api/auth/*`. Key endpoints for email/password:

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/sign-up/email` | Register a new user |
| `POST` | `/api/auth/sign-in/email` | Sign in and receive a session cookie |
| `POST` | `/api/auth/sign-out` | Invalidate the current session |
| `GET` | `/api/auth/session` | Get the current session |
| `GET` | `/api/auth/ok` | Health check — returns `{ status: "ok" }` |

---

## Database Tables

Better Auth manages four tables. They were created via `prisma migrate dev --name add-better-auth-tables`.

| Table | Purpose |
|---|---|
| `user` | Core user record (email, name, role, …) |
| `session` | Active sessions with expiry |
| `account` | Linked auth providers per user |
| `verification` | Email verification and password-reset tokens |

Migration that added user roles: `20260627191647_add_user_role`

---

## Environment Variables

Required in `.env`:

```env
BETTER_AUTH_SECRET=<min 32 char random string>
BETTER_AUTH_URL=http://localhost:3000
```

`BETTER_AUTH_SECRET` is used to sign session tokens. Generate one with:

```bash
openssl rand -base64 32
```
