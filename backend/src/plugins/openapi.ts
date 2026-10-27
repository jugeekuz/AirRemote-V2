import swagger from '@fastify/swagger';
import fp from 'fastify-plugin';
import {
  jsonSchemaTransform,
  jsonSchemaTransformObject,
} from 'fastify-type-provider-zod';

/**
 * Describes every route registered after it as an OpenAPI document, read with
 * `app.swagger()`. Routes behind `app.authenticate` get the bearer scheme.
 */
export const openApiPlugin = fp(
  async (app) => {
    await app.register(swagger, {
      openapi: {
        openapi: '3.1.0',
        info: { title: 'AirRemote API', version: '2.0.0' },
        servers: [{ url: 'http://localhost:3000' }],
        components: {
          securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          },
        },
      },
      transform: (input) => {
        const result = jsonSchemaTransform(input);
        const hooks = [input.route.onRequest ?? []].flat();
        if (!hooks.includes(app.authenticate)) return result;
        return {
          ...result,
          schema: { ...result.schema, security: [{ bearerAuth: [] }] },
        };
      },
      transformObject: jsonSchemaTransformObject,
    });
  },
  { name: 'openapi', dependencies: ['authenticate'] },
);
