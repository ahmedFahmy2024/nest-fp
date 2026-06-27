# Memory — Add Prisma Scripts

Last updated: 2026-06-27T15:45:00+03:00

## What was built

- Added the following Prisma scripts to [package.json](file:///e:/backend/first-pt/package.json):
  - `"prisma:generate": "prisma generate"`
  - `"prisma:migrate": "prisma migrate dev"`
  - `"prisma:format": "prisma format"`
  - `"prisma:studio": "prisma studio"`

## Decisions made

- Mapped the scripts directly to standard Prisma commands using standard script names.

## Problems solved

- None.

## Current state

- Workspace is updated with the new Prisma scripts in [package.json](file:///e:/backend/first-pt/package.json).

## Next session starts with

- Running `pnpm prisma:generate` or other scripts as needed to generate Prisma Client or perform migrations.

## Open questions

- None.
