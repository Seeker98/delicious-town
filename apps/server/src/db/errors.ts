/** PostgreSQL 唯一约束冲突（23505）时返回约束名，否则返回 null */
export function uniqueViolation(e: unknown): string | null {
  const err = e as { code?: unknown; constraint?: unknown } | null;
  if (err && err.code === '23505') return typeof err.constraint === 'string' ? err.constraint : '';
  return null;
}
