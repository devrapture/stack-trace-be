export const POSTGRES_UNIQUE_VIOLATION = '23505';

export function isPostgresError(
  error: unknown,
): error is Error & ({ sqlState: string } | { cause: { sqlState: string } }) {
  return (
    error instanceof Error &&
    ('sqlState' in error
      ? typeof error.sqlState === 'string'
      : typeof error.cause === 'object' &&
        error.cause !== null &&
        'sqlState' in error.cause &&
        typeof error.cause.sqlState === 'string')
  );
}
