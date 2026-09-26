export const POSTGRES_UNIQUE_VIOLATION = '23505';

export function isPostgresError(
  error: unknown,
): error is Error & { sqlState: string } {
  return (
    error instanceof Error &&
    'sqlState' in error &&
    typeof error.sqlState === 'string'
  );
}
