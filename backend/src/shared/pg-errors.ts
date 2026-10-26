/**
 * Postgres errors as Drizzle reports them. Only repositories read database
 * errors (ESLint enforces it).
 */

/** Whether a query was rejected for a unique violation on `constraint`. */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  // Drizzle wraps the driver's error in `cause`.
  const pg = ((error as { cause?: unknown } | null)?.cause ?? error) as {
    code?: unknown;
    constraint_name?: unknown;
  } | null;
  return pg?.code === '23505' && pg.constraint_name === constraint;
}
