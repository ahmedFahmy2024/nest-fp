# Prisma Integration in This NestJS Project

> Written for someone new to both NestJS and Prisma.  
> Everything here is grounded in the actual code in this repo.

---

## Table of Contents

1. [What is Prisma?](#1-what-is-prisma)
2. [How Prisma Fits Into a NestJS App](#2-how-prisma-fits-into-a-nestjs-app)
3. [The Schema File — Your Single Source of Truth](#3-the-schema-file--your-single-source-of-truth)
4. [Migrations — How the Schema Reaches the Database](#4-migrations--how-the-schema-reaches-the-database)
5. [The Driver Adapter — Why This Project Doesn't Use a Query Engine](#5-the-driver-adapter--why-this-project-doesnt-use-a-query-engine)
6. [PrismaService — The NestJS Wrapper Around PrismaClient](#6-prismaservice--the-nestjs-wrapper-around-prismaclient)
7. [PrismaModule — Making the Service Available App-Wide](#7-prismamodule--making-the-service-available-app-wide)
8. [AppModule — Wiring Everything Together](#8-appmodule--wiring-everything-together)
9. [The Second Prisma Client — Why Better Auth Has Its Own](#9-the-second-prisma-client--why-better-auth-has-its-own)
10. [The Config File — prisma.config.ts](#10-the-config-file--prismaconfigts)
11. [The npm Scripts — Your Daily Workflow](#11-the-npm-scripts--your-daily-workflow)
12. [How to Use PrismaService in a New Feature](#12-how-to-use-prismaservice-in-a-new-feature)
13. [The Full Data Flow — End to End](#13-the-full-data-flow--end-to-end)

---

## 1. What is Prisma?

Prisma is an **ORM** (Object-Relational Mapper). Its job is to let you talk to a database using TypeScript instead of raw SQL.

Instead of writing:

```sql
SELECT * FROM "user" WHERE email = 'alice@example.com';
```

You write:

```typescript
const user = await prisma.user.findUnique({ where: { email: 'alice@example.com' } });
```

Prisma gives you full TypeScript autocompletion for every query, and it guarantees the shape of the result matches your schema.

Prisma has three main parts:

| Part | What it does |
|------|-------------|
| **Prisma Schema** (`schema.prisma`) | Describes your database tables in a human-readable format |
| **Prisma Migrate** | Converts schema changes into SQL and runs them on the database |
| **Prisma Client** (`@prisma/client`) | The generated TypeScript library you use in code to query the DB |

---

## 2. How Prisma Fits Into a NestJS App

NestJS uses **Dependency Injection (DI)**. The idea is: instead of every file creating its own database connection, one central service holds the connection, and any other service that needs it just *asks* for it.

The flow in this project:

```
Database (PostgreSQL on Prisma.io)
        ↑
        | TCP connection via PrismaPg driver
        ↑
   PrismaService   ← wraps PrismaClient, managed by NestJS lifecycle
        ↑
   PrismaModule    ← registers PrismaService as a global provider
        ↑
   AppModule       ← imports PrismaModule, makes it available everywhere
        ↑
   Any other Service (e.g. UserService) ← injects PrismaService and calls it
```

---

## 3. The Schema File — Your Single Source of Truth

**File:** [`prisma/schema.prisma`](../prisma/schema.prisma)

The schema file is the single place that defines:
- Which database you're using
- What tables (called **models**) exist
- What columns each table has
- How tables relate to each other

```prisma
// Tells Prisma which TypeScript library to generate
generator client {
  provider = "prisma-client-js"
}

// Tells Prisma which database type to connect to
datasource db {
  provider = "postgresql"
}
```

> **Note:** You'll notice there's no `url = env("DATABASE_URL")` in this `datasource` block.  
> In Prisma 7, when you use a driver adapter (explained in Section 5), the connection  
> URL is passed to the adapter directly in code — not in the schema. The config file  
> (`prisma.config.ts`) handles this for the CLI tools.

### The Enum

```prisma
enum Role {
  PARTICIPANT
  ADMIN
}
```

An `enum` is a column type that can only hold specific values. Here, every user must be either `PARTICIPANT` or `ADMIN` — nothing else is allowed by the database.

### The Models

#### User

```prisma
model User {
  id            String    @id           // Primary key — unique ID string
  name          String                  // User's display name
  email         String    @unique       // Must be unique across all users
  emailVerified Boolean                 // Has the user verified their email?
  image         String?                 // Profile picture URL (optional — the ? means nullable)
  createdAt     DateTime                // Auto-set when record is created
  updatedAt     DateTime                // Auto-set when record is updated
  role          Role      @default(PARTICIPANT) // Defaults to PARTICIPANT

  sessions Session[]  // One user → many sessions (one-to-many relation)
  accounts Account[]  // One user → many accounts (e.g. Google + GitHub OAuth)

  @@map("user")        // The actual SQL table name is "user" (lowercase)
}
```

#### Session

```prisma
model Session {
  id        String   @id
  expiresAt DateTime  // When this login session expires
  token     String   @unique  // The secret token stored in the user's browser cookie

  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  // ↑ This is a foreign key. userId stores the User's id.
  // onDelete: Cascade means: if the User is deleted, all their Sessions are deleted too.

  @@map("session")
}
```

#### Account

An `Account` represents an external OAuth login (e.g. "Sign in with Google"). One user can have multiple accounts linked.

#### Verification

Used by Better Auth to store email verification tokens (e.g. "verify your email" links).

---

## 4. Migrations — How the Schema Reaches the Database

The schema file is just a description. To actually create tables in the database, you run a **migration**.

```
schema.prisma  →  prisma migrate dev  →  SQL file  →  runs on the real database
```

Prisma stores migrations in [`prisma/migrations/`](../prisma/migrations/). Each migration is a folder named with a timestamp and description, containing a `migration.sql` file.

This project has two migrations:

**Migration 1** — `20260627172110_add_better_auth_tables`  
Creates the four core tables: `user`, `session`, `account`, `verification`.

**Migration 2** — `20260627191647_add_user_role`  
Adds the `Role` enum and the `role` column to the `user` table.

**Why keep migrations?** They act as a version history for your database structure. Every developer on the team runs the same migrations and gets the exact same database shape. This is exactly like `git` but for your database schema.

---

## 5. The Driver Adapter — Why This Project Doesn't Use a Query Engine

**This is the most unusual part of the setup compared to older Prisma tutorials.**

Before Prisma 7, Prisma shipped with a built-in "query engine" — a compiled Rust binary that translated Prisma queries into SQL. It read `DATABASE_URL` automatically from your environment.

**Prisma 7 removed the built-in query engine.** Instead, you must provide a **driver adapter** — a thin wrapper around an existing Node.js database driver. This project uses `@prisma/adapter-pg` which wraps the `pg` package (the standard PostgreSQL driver for Node.js).

The practical difference:

```typescript
// OLD way (Prisma 6 and earlier) — no adapter needed
const prisma = new PrismaClient();
// Prisma automatically read DATABASE_URL from process.env

// NEW way (Prisma 7+) — you provide the adapter
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
```

This change gives you more control over connection pooling and lets you use edge runtimes (like Cloudflare Workers), but it does mean the setup is slightly more explicit.

---

## 6. PrismaService — The NestJS Wrapper Around PrismaClient

**File:** [`src/prisma/prisma.service.ts`](../src/prisma/prisma.service.ts)

```typescript
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient          // PrismaService IS a PrismaClient — all query methods available directly
  implements OnModuleInit, OnModuleDestroy  // NestJS lifecycle interfaces
{
  constructor() {
    // Create the driver adapter with the connection string from .env
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL as string });
    // Pass the adapter to PrismaClient (required in Prisma 7)
    super({ adapter });
  }

  // Called automatically by NestJS when the module is loaded
  async onModuleInit() {
    await this.$connect();  // Open the database connection
  }

  // Called automatically by NestJS when the app is shutting down
  async onModuleDestroy() {
    await this.$disconnect();  // Close the database connection cleanly
  }
}
```

### Key Concepts Here

**`@Injectable()`** — This decorator tells NestJS "this class can be injected into other classes." Without it, NestJS's DI system doesn't know this class exists.

**`extends PrismaClient`** — By extending PrismaClient, `PrismaService` *is* a PrismaClient. That means when you inject `PrismaService` into another service and call `this.prisma.user.findMany()`, you're calling PrismaClient's methods directly. No wrapper needed.

**`OnModuleInit` / `OnModuleDestroy`** — NestJS lifecycle hooks. NestJS calls `onModuleInit()` after setting up all the providers, and `onModuleDestroy()` before shutting down. Using these hooks guarantees the connection opens at startup and closes gracefully on shutdown — no dangling connections.

---

## 7. PrismaModule — Making the Service Available App-Wide

**File:** [`src/prisma/prisma.module.ts`](../src/prisma/prisma.module.ts)

```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()           // Makes this module (and its exports) available everywhere
@Module({
  providers: [PrismaService],   // Register PrismaService as a provider inside this module
  exports: [PrismaService],     // Make PrismaService importable by other modules
})
export class PrismaModule {}
```

### What's a Module in NestJS?

A NestJS app is organized into **modules** — each module groups related functionality (controllers, services, etc.). By default, a service defined in one module is invisible to other modules.

To share a service, the module that owns it must `export` it, and every module that wants to use it must `import` the module.

### Why `@Global()`?

The `@Global()` decorator removes the need to import `PrismaModule` in every single module that needs database access. You declare it globally once (in `AppModule`) and every module in the app can inject `PrismaService` without any extra imports.

Without `@Global()`, you'd have to add `PrismaModule` to the `imports` array of every feature module — verbose and easy to forget.

---

## 8. AppModule — Wiring Everything Together

**File:** [`src/app.module.ts`](../src/app.module.ts)

```typescript
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './lib/auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, AuthModule],  // PrismaModule first — other modules may depend on it
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

`AppModule` is the root of the application — NestJS starts here and loads everything. Importing `PrismaModule` here is the one line that makes `PrismaService` globally available.

---

## 9. The Second Prisma Client — Why Better Auth Has Its Own

**File:** [`src/lib/auth/auth.ts`](../src/lib/auth/auth.ts)

```typescript
// This is a standalone PrismaClient, not the NestJS PrismaService.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  // ...
});
```

There are **two** Prisma clients in this project. Here's why:

| | NestJS `PrismaService` | Better Auth's `prisma` |
|---|---|---|
| **Where** | `src/prisma/prisma.service.ts` | `src/lib/auth/auth.ts` |
| **Who owns it** | NestJS DI container | Better Auth library |
| **Used by** | Your own services (UserService, etc.) | Better Auth internally |
| **Lifecycle** | Managed by NestJS hooks | Managed by Better Auth |

Better Auth is a third-party library. It runs its own authentication logic and needs its own database connection to read/write sessions, users, and verifications. It cannot reach into NestJS's DI container to grab `PrismaService`, so it creates its own `PrismaClient`.

This is fine — both clients connect to the same database, they just do different jobs. If you're writing business logic (e.g. fetching a user's workout history), use the injected `PrismaService`. Never import Better Auth's `prisma` directly for your own queries.

---

## 10. The Config File — prisma.config.ts

**File:** [`prisma.config.ts`](../prisma.config.ts)

```typescript
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',   // Where to find the schema
  migrations: {
    path: 'prisma/migrations',      // Where to store migration SQL files
  },
  datasource: {
    url: process.env.DATABASE_URL as string,  // Connection string from .env
  },
});
```

This file is only used by the **Prisma CLI** (e.g. `prisma migrate dev`, `prisma studio`). It tells the CLI where the schema is, where to put migrations, and how to connect to the database.

It has nothing to do with the running NestJS app — at runtime, the connection string is passed directly to `PrismaPg` in `PrismaService`.

The `import 'dotenv/config'` at the top loads your `.env` file so `process.env.DATABASE_URL` is available when you run CLI commands from the terminal.

---

## 11. The npm Scripts — Your Daily Workflow

Defined in [`package.json`](../package.json):

```json
"db:generate":      "prisma generate"
"db:migrate":       "prisma migrate dev"
"db:migrate:deploy":"prisma migrate deploy"
"db:migrate:reset": "prisma migrate reset"
"db:push":          "prisma db push"
"db:studio":        "prisma studio"
"db:seed":          "prisma db seed"
```

| Command | When to use it |
|---------|---------------|
| `npm run db:generate` | After editing `schema.prisma` — regenerates the TypeScript client so your code has up-to-date types and autocompletion |
| `npm run db:migrate` | During development — creates a new migration file and applies it to the database |
| `npm run db:migrate:deploy` | In production/CI — applies pending migrations without prompts |
| `npm run db:migrate:reset` | Nuclear option during development — drops the DB, recreates it, and re-runs all migrations |
| `npm run db:push` | Pushes schema changes to the DB *without* creating a migration file — useful for quick experiments, not for production |
| `npm run db:studio` | Opens Prisma Studio — a browser-based GUI to browse and edit your database rows |
| `npm run db:seed` | Runs a seed script to populate the DB with initial/test data |

**Typical workflow when you change the schema:**

```bash
# 1. Edit prisma/schema.prisma
# 2. Create + apply the migration
npm run db:migrate
# (Prisma prompts you for a migration name, e.g. "add_exercise_table")

# 3. Regenerate the Prisma Client so TypeScript picks up the new types
npm run db:generate
```

---

## 12. How to Use PrismaService in a New Feature

Once you understand the wiring, using Prisma in a new service is straightforward. Here's an example:

**Step 1 — Create a service and inject PrismaService:**

```typescript
// src/users/users.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  // NestJS sees PrismaService in the constructor and injects it automatically
  constructor(private prisma: PrismaService) {}

  // Find all users (equivalent to: SELECT * FROM "user")
  async findAll() {
    return this.prisma.user.findMany();
  }

  // Find one user by email
  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  // Find all sessions for a specific user, with their data included
  async findUserWithSessions(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: { sessions: true },  // JOIN in sessions — no manual SQL needed
    });
  }
}
```

**Step 2 — Register the service in a module:**

```typescript
// src/users/users.module.ts
import { Module } from '@nestjs/common';
import { UsersService } from './users.service';

@Module({
  providers: [UsersService],
  exports: [UsersService],
  // Notice: no need to import PrismaModule here because it's @Global()
})
export class UsersModule {}
```

**Step 3 — Import the module in AppModule:**

```typescript
// src/app.module.ts
import { UsersModule } from './users/users.module';

@Module({
  imports: [PrismaModule, AuthModule, UsersModule],
  // ...
})
export class AppModule {}
```

That's it. `PrismaService` flows from `PrismaModule` → globally available → injected into `UsersService` by NestJS automatically.

---

## 13. The Full Data Flow — End to End

Here's what happens from the moment you start the app to when a query hits the database:

```
npm run start:dev
      ↓
NestJS bootstraps AppModule
      ↓
AppModule imports PrismaModule
      ↓
PrismaModule instantiates PrismaService
      ↓
PrismaService constructor runs:
  - Creates PrismaPg adapter with DATABASE_URL
  - Calls super({ adapter }) to configure PrismaClient
      ↓
NestJS calls onModuleInit()
  - PrismaService.$connect() opens a TCP connection to PostgreSQL
      ↓
App is ready. HTTP requests come in.
      ↓
A request hits a controller (e.g. GET /users)
      ↓
Controller calls UsersService.findAll()
      ↓
UsersService calls this.prisma.user.findMany()
      ↓
PrismaClient translates the call to SQL:
  SELECT "id", "name", "email", ... FROM "user"
      ↓
PrismaPg adapter sends the SQL to PostgreSQL over the open connection
      ↓
PostgreSQL executes it and returns rows
      ↓
PrismaClient maps the rows back to TypeScript objects
      ↓
Result flows back up: UsersService → Controller → HTTP response
      ↓
npm run stop (or Ctrl+C)
      ↓
NestJS calls onModuleDestroy()
  - PrismaService.$disconnect() closes the connection cleanly
```

---

## Quick Reference

| File | Role |
|------|------|
| `prisma/schema.prisma` | Defines models, enums, relations |
| `prisma/migrations/` | SQL history of every schema change |
| `prisma.config.ts` | CLI configuration (schema path, migration path, DB URL) |
| `src/prisma/prisma.service.ts` | NestJS-managed PrismaClient with lifecycle hooks |
| `src/prisma/prisma.module.ts` | Global NestJS module that exposes PrismaService |
| `src/app.module.ts` | Root module that imports PrismaModule |
| `src/lib/auth/auth.ts` | Separate PrismaClient owned exclusively by Better Auth |

| Command | Effect |
|---------|--------|
| `npm run db:migrate` | Create + apply a new migration (development) |
| `npm run db:generate` | Regenerate the TypeScript client after schema changes |
| `npm run db:studio` | Open the visual database browser |
| `npm run db:migrate:reset` | Wipe and rebuild the database from scratch |
