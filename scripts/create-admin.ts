/**
 * Promote an EXISTING, verified user to ADMIN. Deliberately a
 * command-line script rather than an HTTP endpoint: there is no
 * "first admin" bootstrap problem to solve with an endpoint, and
 * leaving no network-reachable way to grant admin to anyone is itself
 * the safest possible design for the very first one.
 *
 * Safety checks, in order:
 *  1. The user must already exist (this script never CREATES an
 *     account — registration and email verification already prove
 *     who someone is; this only changes what they're allowed to do).
 *  2. Their primary email must be verified.
 *  3. If they're already an ADMIN, nothing changes (idempotent).
 *
 * The role change and its audit entry commit in one transaction. No
 * `actorUserId` is recorded: this runs outside any authenticated
 * request, so there is genuinely no acting user to attribute it to —
 * the audit row's `metadata.via = "cli"` says so explicitly instead
 * of leaving the gap unexplained.
 *
 * Usage: bun run create-admin -- someone@example.com
 */
import { createDatabaseClient } from '../src/prisma/db.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env first.');
}

const rawEmail = process.argv[2];
if (!rawEmail) {
  console.error('Usage: bun run create-admin -- <email>');
  process.exit(1);
}

// Same normalization policy as src/users/normalize-email.ts: trim,
// lowercase the DOMAIN only. Duplicated here (not imported) so this
// script has zero dependency on the NestJS application's own module
// graph — it must keep working even if the app itself doesn't boot.
const trimmed = rawEmail.trim();
const atIndex = trimmed.lastIndexOf('@');
if (atIndex <= 0 || atIndex === trimmed.length - 1) {
  console.error(`"${rawEmail}" is not a valid email address.`);
  process.exit(1);
}
const normalizedEmail = `${trimmed.slice(0, atIndex)}@${trimmed.slice(atIndex + 1).toLowerCase()}`;

const db = createDatabaseClient(DATABASE_URL);

async function main(): Promise<void> {
  await db.connect();

  const emailRecord = await db.orm.public.UserEmail.where({ normalizedEmail })
    .include('user')
    .first();

  if (!emailRecord) {
    console.error(
      `No user found with email ${normalizedEmail}. Register and verify first.`,
    );
    process.exit(1);
  }

  if (!emailRecord.verifiedAt) {
    console.error(
      `${normalizedEmail} has not verified their email yet. Refusing to promote.`,
    );
    process.exit(1);
  }

  if (emailRecord.user.role === 'ADMIN') {
    console.log(`${normalizedEmail} is already an ADMIN. Nothing to do.`);
    return;
  }

  await db.transaction(async (tx) => {
    await tx.orm.public.User.where({ id: emailRecord.user.id }).update({
      role: 'ADMIN',
    });
    await tx.orm.public.AuditLog.create({
      userId: emailRecord.user.id,
      eventType: 'ADMIN_ROLE_GRANTED',
      metadata: { via: 'cli' },
    });
  });

  console.log(`${normalizedEmail} is now an ADMIN.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.close();
  });
