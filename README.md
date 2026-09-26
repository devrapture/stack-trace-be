# Stack Trace backend

NestJS API using Fastify, PostgreSQL, and the Prisma ORM 8 data contract. The app currently exposes health checks and a user repository; it does not yet expose user or authentication HTTP routes.

## Local setup

You need Node.js, pnpm, and PostgreSQL 15 or newer. The included Docker Compose service provides a local PostgreSQL instance.

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres
pnpm exec prisma db migrate
pnpm run start:dev
```

Adjust `DATABASE_URL` in `.env` if you use a different database. `NODE_ENV`, `PORT`, and `LOG_LEVEL` are also configured there; see [.env.example](.env.example). The app listens on port 3000 by default.

## Endpoints

| Endpoint       | Purpose                                                                |
| -------------- | ---------------------------------------------------------------------- |
| `GET /healthz` | Process liveness.                                                      |
| `GET /readyz`  | Database readiness; returns HTTP 503 when the database is unavailable. |

Future API routes use the `/api/v1` prefix. The health routes are outside that prefix.


## Contract and migrations

After editing `src/prisma/contract.prisma`, regenerate `src/prisma/contract.json` and `src/prisma/contract.d.ts`:

```bash
pnpm run contract:emit
```

Plan a migration from the latest migration directory, then check the generated snapshot and migration artifacts. Pass `--from` explicitly because the `db` ref may still point to an earlier contract.

```bash
pnpm exec prisma migration plan --from 20260925T1953_auth_identity_provider_user_id --name your-change
pnpm exec prisma migration check
```

Replace the `--from` value with the current migration tip for later changes. If Prisma generates a data backfill placeholder, complete it and run the generated `migration.ts` to emit its operations before checking the migration. Apply reviewed migrations with `pnpm exec prisma db migrate`.

The current migrations make normalized emails globally unique and add a required `provider_user_id` column. Existing duplicate normalized emails must be resolved before applying the uniqueness migration. The provider ID migration has no backfill and requires `auth_identities` to be empty; for a populated database, add a staged backfill using the real provider account IDs before applying it.

## Checks

```bash
pnpm run lint
pnpm exec tsc --noEmit
pnpm run test
pnpm run build
```
