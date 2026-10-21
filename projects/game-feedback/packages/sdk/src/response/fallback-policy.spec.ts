import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { applyResponseFallbacks } from './fallback-policy';

describe('field fallback limits', () => {
  it('keeps array size and custom field constraints in the final schema validation', () => {
    const schema = z.object({
      items: z.array(z.object({ id: z.string().min(1), name: z.string().min(1) })).length(2),
    });
    const value = applyResponseFallbacks(schema, { items: [{ id: 'a', name: null }] });
    expect(schema.safeParse(value).success).toBe(false);
  });
  it('leaves same-named fields with incompatible types or literals under their original schema', () => {
    const schema = z.object({ name: z.literal('fixed-name'), unreadCount: z.object({ value: z.number() }) });
    const value = { name: 'fixed-name', unreadCount: { value: 2 } };
    expect(schema.parse(applyResponseFallbacks(schema, value))).toEqual(value);
    expect(schema.safeParse(applyResponseFallbacks(schema, { ...value, name: null })).success).toBe(false);
  });
  it('uses zero only for malformed display counts and never coerces numeric strings', () => {
    const schema = z.object({ unreadCount: z.number().int().nonnegative() });
    for (const value of ['2', -1, 1.5, NaN, Infinity, {}, null, undefined])
      expect(schema.parse(applyResponseFallbacks(schema, { unreadCount: value }))).toEqual({
        unreadCount: 0,
      });
    expect(schema.parse(applyResponseFallbacks(schema, { unreadCount: 7 }))).toEqual({ unreadCount: 7 });
  });
});
