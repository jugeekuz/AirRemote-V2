import type { ErrorCode, ErrorResponse } from '@airremote/contracts';
import type { FastifyError } from 'fastify';
import fp from 'fastify-plugin';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { AppError } from '../shared/errors';

function errorBody(
  code: ErrorCode,
  message: string,
  details?: ErrorResponse['error']['details'],
): ErrorResponse {
  return { error: { code, message, ...(details ? { details } : {}) } };
}

/** Sends every error, including unknown routes, in the shared error envelope. */
export const errorHandlerPlugin = fp(async (app) => {
  app.setErrorHandler<FastifyError | AppError>((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      const details = error.validation.map((issue) => ({
        path: issue.instancePath,
        message: issue.message ?? 'Invalid value',
      }));
      return reply
        .code(400)
        .send(
          errorBody('VALIDATION_FAILED', 'Request validation failed', details),
        );
    }

    if (error instanceof AppError) {
      return reply
        .code(error.statusCode)
        .send(errorBody(error.code, error.message));
    }

    // Fastify's own client errors (malformed JSON, body too large, ...).
    // Anything can be thrown, including null and undefined.
    const statusCode =
      typeof error === 'object' && error !== null
        ? error.statusCode
        : undefined;
    if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
      return reply
        .code(statusCode)
        .send(
          errorBody(
            statusCode === 404 ? 'NOT_FOUND' : 'BAD_REQUEST',
            error.message,
          ),
        );
    }

    request.log.error({ err: error }, 'Unhandled error');
    return reply
      .code(500)
      .send(errorBody('INTERNAL_ERROR', 'An unexpected error occurred'));
  });

  app.setNotFoundHandler((request, reply) =>
    reply
      .code(404)
      .send(
        errorBody(
          'NOT_FOUND',
          `Route ${request.method} ${request.url} not found`,
        ),
      ),
  );
});
