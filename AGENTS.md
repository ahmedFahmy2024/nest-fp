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
- Shared guards, interceptors, decorators go in src/common/
- Use Nest CLI: nest g module / nest g service / nest g controller

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
