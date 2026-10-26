/** The Postgres error behind a rejected query (Drizzle wraps it in `cause`). */
export async function rejection(
  query: PromiseLike<unknown>,
): Promise<{ code: string; constraint?: string }> {
  try {
    await query;
  } catch (error) {
    const pg = ((error as { cause?: unknown }).cause ?? error) as {
      code?: string;
      constraint_name?: string;
    };
    return {
      code: pg.code ?? 'unknown',
      ...(pg.constraint_name ? { constraint: pg.constraint_name } : {}),
    };
  }
  throw new Error('the query was accepted but should have been rejected');
}
