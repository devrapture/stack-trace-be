# Stack Trace API

Backend API for Stack Trace, built with NestJS, Fastify, PostgreSQL, the Prisma ORM 8 data contract, and pg-boss for background email delivery.

The service currently provides:

- password registration, email verification, login, and password recovery;
- Google and GitHub OAuth login;
- queued account emails through pg-boss and Resend;
- short-lived JWT access tokens and rotating refresh-token sessions;
- web sessions backed by HTTP-only cookies and CSRF protection;
- session listing and revocation;
- role-based admin access and audit logs; and
- liveness and database-readiness checks.

## Requirements

- Node.js (a current LTS release)
- [pnpm](https://pnpm.io/) 12
- PostgreSQL 15 or newer, or Docker with Compose
- A [Resend](https://resend.com/) API key and verified sender
- Google and GitHub OAuth application credentials
- Bun, only if you need to run the `create-admin` utility

## Local setup

1. Install dependencies and create the local environment file:

   ```bash
   pnpm install
   cp .env.example .env
   ```

2. Fill in every value in `.env`. Configuration is validated at startup, so placeholder and blank values must be replaced. In particular:

   - `OTP_HASH_SECRET` must be at least 32 characters.
   - `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` must be an RS256-compatible PEM key pair. Encode line breaks as `\n` when storing the keys on one line.
   - `JWT_KID` identifies the active signing key and can be any stable, non-empty value for local development.
   - `RESEND_*` values control delivery of verification and password-recovery emails.
   - `GOOGLE_*` and `GITHUB_*` contain the OAuth app credentials.
   - `PUBLIC_BASE_URL` is the externally reachable origin of this API, without the `/api/v1` suffix.

3. Start PostgreSQL and apply the committed migrations:

   ```bash
   docker compose up -d postgres
   docker compose ps
   pnpm exec prisma db migrate
   ```

   Wait for PostgreSQL to report healthy before applying migrations. The Compose service listens on `127.0.0.1:5432` and matches the default `DATABASE_URL` in `.env.example`.

4. Start the API in watch mode:

   ```bash
   pnpm run start:dev
   ```

The server listens on `http://localhost:3000` by default. Application routes use the `/api/v1` prefix; health routes do not.

The API also starts the email worker. On its first successful startup, pg-boss creates its own `pgboss` schema and the `email.send` queue. The database user needs permission to create and manage those objects.

### OAuth callback URLs

Register these callback URLs with the providers for local development:

```text
http://localhost:3000/api/v1/oauth/google/callback
http://localhost:3000/api/v1/oauth/github/callback
```

For another environment, replace the origin with `PUBLIC_BASE_URL`. OAuth login currently supports `WEB` clients only.

## Background email delivery

Registration, email verification, password recovery, password changes, and OAuth account notifications enqueue messages in `email.send`. The worker delivers them through Resend after enqueueing succeeds. A successful request does not mean the email has already been delivered.

pg-boss uses the application's existing `DATABASE_URL` and stores its tables in the `pgboss` schema. No separate PostgreSQL database or `PGBOSS_DATABASE_URL` is configured. Its connection pool allows up to five connections per API process, in addition to Prisma's connections.

The main components are:

| File | Responsibility |
| --- | --- |
| [PgBossService](src/queue/pg-boss.service.ts) | Starts pg-boss, records queue statistics and warnings, and stops it during shutdown. |
| [EmailQueue](src/email/email-queue.ts) | Defines the enqueue input and result used by application services. |
| [PgBossEmailQueue](src/email/pg-boss-email.queue.ts) | Creates the queue, enqueues messages, and registers the worker. |
| [ResendEmailTransport](src/email/resend-email.provider.ts) | Sends messages through Resend with the job's idempotency key. |

The queue is created with these defaults:

| Setting | Value |
| --- | --- |
| Retries after the initial attempt | 5 |
| Retry delay | Exponential backoff starting at 10 seconds, capped at 60 seconds |
| Maximum duration of an execution attempt | 60 seconds |
| Retention for jobs waiting to run or retry | 6 hours |
| Retention after completion | 1 hour, followed by periodic cleanup |
| Worker concurrency | 1 job per API process |
| Polling interval | 1 second |

Messages marked `critical` receive priority 10; other messages receive priority 0. Before delivery, the worker checks an OTP job's `expiresAt` and skips expired messages. Retries reuse the same Resend idempotency key. Skipping an expired OTP completes its job without sending an email.

Business-data writes and enqueueing currently use separate transactions. The queue makes an accepted job durable, but does not make the preceding account or challenge write atomic with that job.

## Run the pg-boss dashboard

Start PostgreSQL and the API first so the `pgboss` schema exists. In a separate terminal, run:

```bash
DATABASE_URL='postgresql://stack_trace:local-development-only@127.0.0.1:5432/stack_trace' \
PGBOSS_SCHEMA=pgboss \
HOST=127.0.0.1 \
PORT=3001 \
pnpm dlx @pg-boss/dashboard@1.13.0
```

Open [http://127.0.0.1:3001](http://127.0.0.1:3001). Keep the terminal running; press `Ctrl+C` to stop the dashboard. The API continues to use port 3000.

The connection string above matches the local Compose database. If your `DATABASE_URL` differs, supply the same value used by the API. This command passes configuration explicitly and does not load `.env` automatically.

Dashboard 1.13.x matches pg-boss 12.38.x. Check the [dashboard compatibility table](https://pgboss.io/dashboard#matching-pg-boss-versions) when upgrading pg-boss.

To use the project's installed dashboard package and load `.env` instead:

```bash
HOST=127.0.0.1 PORT=3001 PGBOSS_SCHEMA=pgboss \
node --env-file=.env node_modules/@pg-boss/dashboard/build/server.js
```

The shell's `PORT=3001` takes precedence over the API's `PORT` in `.env`. If this command reports incompatible React versions, use the isolated `pnpm dlx` command above. The installed dashboard requires matching `react` and `react-dom` versions.

### Find completed or failed email jobs

Open **Jobs**, select queue **email.send**, and clear the state filter or select **Completed** or **Failed**. A fast worker can finish an email before you open the dashboard, leaving no queued or active jobs. Completed jobs remain until retention cleanup runs.

The dashboard runs separately from the API. It displays job payloads, including email contents and OTPs, and allows job actions. The commands above bind it to localhost. Before exposing it elsewhere, configure authentication as described in the [dashboard documentation](https://pgboss.io/dashboard#basic-authentication).

## Troubleshoot local connections

If API startup reports `ECONNREFUSED ::1:5432` or `ECONNREFUSED 127.0.0.1:5432`, PostgreSQL is not accepting connections at the configured local address. Check the service:

```bash
docker compose up -d postgres
docker compose ps
docker compose logs postgres
```

Confirm that `DATABASE_URL` matches the running server's host and published port. The Prisma startup log alone does not verify a query succeeds; `/readyz` performs a database ping once the API is running.

If the browser reports a refused connection on port 3001, start the dashboard in a separate terminal. If the dashboard opens but jobs are missing, check its database URL, `PGBOSS_SCHEMA=pgboss`, and job filters.

## API

Passwords must be between 8 and 128 characters. OTP values are six digits. Unless marked otherwise, authenticated routes accept either `Authorization: Bearer <access-token>` or the `access_token` cookie.

### Public routes

| Method | Route | Body or query | Purpose |
| --- | --- | --- | --- |
| `GET` | `/healthz` | — | Process liveness. |
| `GET` | `/readyz` | — | Database readiness; returns `503` when unavailable. |
| `POST` | `/api/v1/auth/register` | `{ email, password }` | Register and queue a verification OTP email. |
| `POST` | `/api/v1/auth/email-verification/verify` | `{ email, otp }` | Verify the primary email. |
| `POST` | `/api/v1/auth/email-verification/resend` | `{ email }` | Queue a new verification OTP email. |
| `POST` | `/api/v1/auth/login` | `{ email, password, clientType, deviceName? }` | Create a session. |
| `POST` | `/api/v1/auth/refresh` | `{ refreshToken? }` | Rotate a refresh token and issue a new access token. |
| `POST` | `/api/v1/auth/forgot` | `{ email }` | Queue a password-reset OTP email when applicable. |
| `POST` | `/api/v1/auth/reset` | `{ email, otp, newPassword }` | Reset a password. |
| `GET` | `/api/v1/oauth/google/start` | `?clientType=WEB` | Start Google OAuth. |
| `GET` | `/api/v1/oauth/github/start` | `?clientType=WEB` | Start GitHub OAuth. |

The OAuth callback routes are provider-facing endpoints and complete the session after a successful authorization.

### Authenticated routes

| Method | Route | Body or query | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/auth/me` | — | Return the current user profile. |
| `GET` | `/api/v1/auth/sessions` | — | List the current user's active sessions. |
| `DELETE` | `/api/v1/auth/sessions/:sessionId` | — | Revoke one of the current user's sessions. |
| `POST` | `/api/v1/auth/change-password` | `{ currentPassword, newPassword }` | Change the password and revoke other sessions. |
| `POST` | `/api/v1/auth/logout` | — | Revoke the current session. |
| `POST` | `/api/v1/auth/logout-all` | — | Revoke all sessions for the current user. |
| `GET` | `/api/v1/admin/audit-logs` | `?limit=1..100&cursor=<json>` | List audit events; requires the `ADMIN` role. |

Audit-log pagination uses the final row from the previous response as the next cursor:

```json
{"createdAt":"2026-10-14T00:47:00Z","id":"00000000-0000-4000-8000-000000000000"}
```

URL-encode that JSON before passing it as the `cursor` query parameter.

## Session modes and CSRF

`clientType` can be `WEB`, `IOS`, `ANDROID`, or `OTHER`.

- `WEB` login stores access and refresh tokens in HTTP-only cookies and returns `{ "authenticated": true }`. It also sets a readable `csrf_token` cookie.
- Other client types receive `accessToken` and `refreshToken` in the JSON response. Send the access token as a bearer token and the refresh token in the `/auth/refresh` request body.
- Cookie-authenticated requests to password change, session revocation, logout, and logout-all must echo the `csrf_token` cookie in the `x-csrf-token` header.
- Cookie-based refresh also requires the `x-csrf-token` header. Supplying a refresh token in the request body does not.

Access tokens expire after 15 minutes. Refresh sessions expire after 30 days and rotate on every refresh. A user may have up to 10 active sessions; creating another session revokes the oldest one.

## Admin access

There is intentionally no HTTP endpoint for granting the first admin role. Register and verify a user, then promote it from the command line:

```bash
bun run create-admin -- someone@example.com
```

The command is idempotent, requires a verified primary email, and records the role grant in the audit log.

## Database contract and migrations

The editable data contract is `src/prisma/contract.prisma`. Its neighboring `contract.json` and `contract.d.ts` files are generated and should be committed.

After changing the contract:

```bash
pnpm run contract:emit
pnpm exec prisma migration plan --from <current-migration-directory> --name <change-name>
pnpm run db:migration:check
```

Review the generated snapshot and migration operations before applying them. If Prisma creates a data-backfill placeholder, implement and run the generated `migration.ts` so it emits the required operations. Then apply the migration and advance the database ref:

```bash
pnpm exec prisma db migrate --advance-ref db
```

For a fresh checkout or deployment that only needs to apply already committed migrations, use `pnpm run db:migrate:deploy`.

## Development commands

| Command | Purpose |
| --- | --- |
| `pnpm run start:dev` | Run the API in watch mode. |
| `pnpm run build` | Compile the production build. |
| `pnpm run start:prod` | Run the compiled application. |
| `pnpm run lint` | Run Oxlint. |
| `pnpm run format:check` | Check formatting. |
| `pnpm run format` | Format source files. |
| `pnpm run typecheck` | Run TypeScript without emitting files. |
| `pnpm run test` | Run unit tests once. |
| `pnpm run test:watch` | Run unit tests in watch mode. |
| `pnpm run test:cov` | Run tests with coverage. |
| `pnpm run test:e2e` | Run end-to-end tests. |

Run the main verification suite before opening a pull request:

```bash
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
```

