import { STATUS_CODES } from 'node:http';
import type { ErrorResponse } from '@airremote/contracts';
import type { FastifyError } from 'fastify';
import fp from 'fastify-plugin';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import type { AppError } from '../shared/errors';

function errorBody(
  statusCode: number,
  message: string,
  details?: ErrorResponse['details'],
): ErrorResponse {
  return {
    statusCode,
    error: STATUS_CODES[statusCode] ?? 'Error',
    message,
    ...(details ? { details } : {}),
  };
}

/** Sends every error, including unknown routes, in the shared ErrorResponse shape. */
export const errorHandlerPlugin = fp(async (app) => {
  app.setErrorHandler<FastifyError | AppError>((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      const details = error.validation.map((issue) => ({
        path: issue.instancePath,
        message: issue.message ?? 'Invalid value',
      }));
      return reply
        .code(400)
        .send(errorBody(400, 'Request validation failed', details));
    }

    const { statusCode } = error;
    if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send(errorBody(statusCode, error.message));
    }

    request.log.error({ err: error }, 'Unhandled error');
    return reply.code(500).send(errorBody(500, 'An unexpected error occurred'));
  });

  app.setNotFoundHandler((request, reply) =>
    reply
      .code(404)
      .send(errorBody(404, `Route ${request.method} ${request.url} not found`)),
  );
});
