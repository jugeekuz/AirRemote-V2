import type { ErrorCode } from '@airremote/contracts';

/** An error whose status, code and message are safe to send to the client. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
