import { describe, expect, it } from 'vitest';
import {
  buttonListResponseSchema,
  buttonResponseSchema,
  learnButtonRequestSchema,
} from '../buttons.contract';

describe('learnButtonRequestSchema', () => {
  it('accepts a valid body and trims the name', () => {
    expect(learnButtonRequestSchema.parse({ name: ' Power ' })).toEqual({
      name: 'Power',
    });
  });

  it('rejects a missing name', () => {
    expect(learnButtonRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('buttonResponseSchema', () => {
  it('accepts a button', () => {
    const body = {
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      remoteId: '0b6f8a52-3c1e-4d7a-9f10-5a2b8c4d6e11',
      name: 'Power',
    };
    expect(buttonResponseSchema.parse(body)).toEqual(body);
  });
});

describe('buttonListResponseSchema', () => {
  const item = {
    id: '5d1c2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
    remoteId: '5d1c2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
    name: 'Power',
  };

  it('accepts an empty list and a list of items', () => {
    expect(buttonListResponseSchema.parse([])).toEqual([]);
    expect(buttonListResponseSchema.parse([item])).toEqual([item]);
  });

  it('rejects an invalid item', () => {
    expect(buttonListResponseSchema.safeParse([{ id: '1' }]).success).toBe(
      false,
    );
  });
});
