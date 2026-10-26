import { describe, expect, it } from 'vitest';
import { nameSchema } from '../names.contract';

describe('nameSchema', () => {
  it('trims surrounding whitespace', () => {
    expect(nameSchema.parse('  Power ')).toBe('Power');
    expect(nameSchema.parse(' Power')).toBe('Power');
  });

  it('accepts 100 characters', () => {
    expect(nameSchema.safeParse('a'.repeat(100)).success).toBe(true);
  });

  it.each(['', '   ', 'a'.repeat(101)])('rejects %j', (name) => {
    expect(nameSchema.safeParse(name).success).toBe(false);
  });
});
