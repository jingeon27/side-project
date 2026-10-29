import { z } from 'zod';

// Apply only to presentation fields declared by a response schema. Never coerce booleans or numbers.
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const policies = {
  nickname: {
    schema: z.string().trim().min(1).max(24).catch('알 수 없는 플레이어'),
    fallback: '알 수 없는 플레이어',
  },
  name: { schema: z.string().trim().min(1).catch('이름 없음'), fallback: '이름 없음' },
  description: { schema: z.string().catch(''), fallback: '' },
  iconUrl: {
    schema: z
      .url({ protocol: /^https?$/ })
      .nullable()
      .catch(null),
    fallback: null,
  },
  clan: { schema: z.string().trim().min(1).nullable().catch(null), fallback: null },
  supercellTag: {
    schema: z
      .string()
      .regex(/^#[A-Z0-9]{1,15}$/)
      .nullable()
      .catch(null),
    fallback: null,
  },
  answerCount: { schema: count.catch(0), fallback: 0 },
  helpfulCount: { schema: count.catch(0), fallback: 0 },
  unreadCount: { schema: count.catch(0), fallback: 0 },
  isVerified: { schema: z.boolean().catch(false), fallback: false },
} satisfies Record<string, { schema: z.ZodType; fallback: unknown }>;

function policyFor(key: string) {
  if (Object.hasOwn(policies, key)) return policies[key as keyof typeof policies];
  return undefined;
}

/** Normalize fields with an explicit fallback, then let the original schema validate the complete response. */
export function applyResponseFallbacks(schema: z.ZodType, input: unknown): unknown {
  if (schema instanceof z.ZodObject && typeof input === 'object' && input !== null && !Array.isArray(input)) {
    const source: Record<string, unknown> = input as Record<string, unknown>;
    const value: Record<string, unknown> = { ...source };
    for (const [key, field] of Object.entries(schema.shape)) {
      if (!(field instanceof z.ZodType)) continue;
      const policy = policyFor(key);
      // A schema with a different meaning/type for the same field name keeps its own validation.
      if (policy && field.safeParse(policy.fallback).success) {
        value[key] = policy.schema.parse(source[key]);
        continue;
      }
      value[key] = applyResponseFallbacks(field, source[key]);
    }
    return value;
  }
  if (schema instanceof z.ZodArray && Array.isArray(input)) {
    const element = schema.element;
    if (element instanceof z.ZodType) return input.map((value) => applyResponseFallbacks(element, value));
  }
  if (schema instanceof z.ZodNullable || schema instanceof z.ZodOptional || schema instanceof z.ZodDefault) {
    if (input === null || input === undefined) return input;
    const inner = schema.unwrap();
    if (inner instanceof z.ZodType) return applyResponseFallbacks(inner, input);
  }
  if (schema instanceof z.ZodUnion) {
    for (const option of schema.options) {
      if (!(option instanceof z.ZodType)) continue;
      const candidate = applyResponseFallbacks(option, input);
      if (option.safeParse(candidate).success) return candidate;
    }
  }
  return input;
}
