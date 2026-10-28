import { z } from 'zod';

/** The 204 of a route that answers with no body, e.g. a delete. */
export const noContentResponseSchema = z.null().describe('No content');
