/**
 * Logs an error that is caught and not rethrown. The single place to hook an
 * error reporter (Sentry, Crashlytics) into later.
 */
export function logError(context: string, error: unknown): void {
  console.error(`[${context}]`, error);
}
