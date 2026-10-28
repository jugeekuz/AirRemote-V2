import { describe, expect, it } from 'vitest';
import { noContentResponseSchema } from '../no-content.contract';

describe('noContentResponseSchema', () => {
  it('accepts no body', () => {
    expect(noContentResponseSchema.safeParse(null).success).toBe(true);
  });

  it('rejects a body', () => {
    expect(noContentResponseSchema.safeParse({}).success).toBe(false);
  });

  it('is described, so the OpenAPI response has a description', () => {
    expect(noContentResponseSchema.description).toBe('No content');
  });
});
