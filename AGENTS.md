# Hakcathon Backend

NestJS 11 project. Express adapter.

## Role

You are a senior NestJS developer. Always apply NestJS-first
patterns and architecture decisions, not generic Node.js approaches.

## Code standards

- Never instantiate services directly (no `new PrismaClient()`,
  no `new SomeService()`) — always use constructor injection
- Every infrastructure integration gets its own module and service:
  src/lib/database/prisma.module.ts + prisma.service.ts
  src/lib/mail/mail.module.ts + mail.service.ts
- Mark infrastructure modules @Global() and import once in AppModule
- Feature modules go in src/module/<name>/
- Shared guards, interceptors, decorators go in `src/common/`
  - `src/common/decorators/` — e.g. `@ResponseMessage`
  - `src/common/interceptors/` — e.g. `TransformInterceptor`
- Use Nest CLI: nest g module / nest g service / nest g controller

## Project structure (current state)

```
src/
├── main.ts                        # Bootstrap; bodyParser: false; global TransformInterceptor
├── app.module.ts                  # Root module — imports PrismaModule, AuthModule, UserModule
├── app.controller.ts              # GET / — @AllowAnonymous() health check
├── app.service.ts                 # Returns "Hello World!"
│
├── prisma/
│   ├── prisma.module.ts           # @Global() — exports PrismaService; imported once in AppModule
│   └── prisma.service.ts          # Extends PrismaClient; uses PrismaPg driver adapter (Prisma 7+)
│
├── lib/
│   └── auth/
│       ├── auth.module.ts         # Wraps @thallesp/nestjs-better-auth BetterAuthModule.forRoot()
│       └── auth.ts                # betterAuth() config — prismaAdapter, emailAndPassword, role field
│
├── common/
│   ├── decorators/
│   │   └── response-message.decorator.ts  # @ResponseMessage('...') — sets custom message metadata
│   └── interceptors/
│       └── transform.interceptor.ts       # Wraps every response in { statusCode, message, data }
│
└── module/
    └── user/
        ├── user.module.ts         # Feature module — no @Global(); relies on PrismaModule being global
        ├── user.service.ts        # findAll() + findById(id) — throws NotFoundException if not found
        └── user.controller.ts     # GET /user/all (@Roles(['ADMIN'])), GET /user/:id (authenticated)
```

### Key wiring notes

- `bodyParser: false` in `NestFactory.create` — required; `@thallesp/nestjs-better-auth` manages body
  parsing for `/api/auth/*` routes itself.
- `PrismaService` uses `PrismaPg` driver adapter — Prisma 7 removed the built-in query engine and
  requires an explicit driver adapter for every `PrismaClient` instantiation.
- `auth.ts` creates its own standalone `PrismaClient` (not injected from DI) because Better Auth
  initialises outside the NestJS lifecycle. This is intentional and expected.
- Every route is protected by a global `AuthGuard` from `BetterAuthModule`. Use `@AllowAnonymous()`
  from `@thallesp/nestjs-better-auth` to opt a route out.
- `TransformInterceptor` is registered globally via `app.useGlobalInterceptors()` in `main.ts`.
  It wraps every controller response in `{ statusCode, message, data }`. Use `@ResponseMessage('...')`
  on a handler or controller class to override the default `"Success"` message.

## Database schema (prisma/schema.prisma)

Models: `User`, `Session`, `Account`, `Verification` — all required by Better Auth.
Custom additions: `Role` enum (`PARTICIPANT` | `ADMIN`), `role` field on `User` (default `PARTICIPANT`).

Feature models:
- `Hackathon` — `id` (cuid), `name`, optional `description`, `startDate`, `endDate`, `isActive` (default `true`), `createdAt`/`updatedAt`, `authorId` FK → `User` (cascade delete).
- `HackathonParticipant` — `id` (cuid), `joinedAt`, `hackathonId` FK → `Hackathon` (cascade delete), `userId` FK → `User` (cascade delete). Unique constraint on `[hackathonId, userId]`.

## API surface

All responses are wrapped by `TransformInterceptor` in `{ statusCode, message, data }`.

| File | Endpoint | Auth |
|---|---|---|
| `app.controller.ts` | `GET /` | Public (`@AllowAnonymous`) |
| `lib/auth/auth.module.ts` | `ALL /api/auth/*` | Handled by Better Auth |
| `module/user/user.controller.ts` | `GET /user/all` | Authenticated + `@Roles(['ADMIN'])` |
| `module/user/user.controller.ts` | `GET /user/:id` | Authenticated (any role) |

OpenAPI specs live in `api-dog/`. Current files:
- `api-dog/auth.openapi.json`
- `api-dog/user.openapi.json`

## Source of truth

opensrc is the source of truth for every library used in this project.
Do not rely on training data or memory for any library API — always read the actual source.

### Rule

Before implementing any feature that depends on a library:

1. Check if that library's source is already cached: `opensrc list`
2. If not cached, fetch it before writing any code: `opensrc fetch <package>`
3. Read the source to verify constructor signatures, method names, interfaces, and options

```bash
opensrc fetch <package>              # fetch on first use
opensrc list                         # see what's already cached
rg "<pattern>" $(opensrc path <package>)          # search source
cat $(opensrc path <package>)/<path/to/file>      # read a file
```

### Libraries already cached

| Library | Package(s) | Use case |
|---|---|---|
| NestJS | `@nestjs/common` `@nestjs/core` `@nestjs/platform-express` | Framework — all features |
| Prisma | `prisma` `@prisma/client` | Database |

### Upcoming libraries (fetch before starting the feature)

| Library | Package(s) | Feature |
|---|---|---|
| better-auth | `better-auth` | Authentication |

### Caveats

- opensrc only covers TypeScript/JavaScript source. For schema grammar, config file rules,
  or breaking changes enforced by compiled engines (e.g. Prisma's Rust engine), also check
  Context7 docs alongside opensrc.

## API Documentation

For every module created, generate a complete OpenAPI 3.1 spec and place it in the `api-dog/` directory at the project root.

### Rules

- File naming: `api-dog/<module-name>.openapi.json` (e.g. `api-dog/auth.openapi.json`)
- Format: OpenAPI 3.1 JSON
- Every endpoint in the module must be included with:
  - Correct HTTP method and path
  - Request body schema with required fields and examples
  - All meaningful response schemas (200, 400, 401, 404, 422, etc.)
  - Security scheme if the endpoint requires authentication
- Reusable types go under `components/schemas`
- Reusable responses go under `components/responses`
- Security schemes go under `components/securitySchemes`
- Import the generated file into Apidog via **Import → OpenAPI**

## Skills

Do not load any skill by default. Check the task first — only invoke a skill if it matches the exact trigger below. Never invoke a skill just because it exists.

- `/architect` — before building something non-trivial with no plan yet
- `/review` — when a feature is done and needs a production check
- `/recover` — when something is broken and the fix isn't obvious
- `/remember` — at the start of a new session to restore context,
  and at the end to save progress

## Session continuity

REQUIRED — do not skip, do not wait to be asked:

- **First action of every session:** run `/remember restore` before doing anything else.
- **Last action of every session:** run `/remember save` before closing.
