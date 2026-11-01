import { z } from 'zod';

const searchSchema = z.string().trim().max(100).catch('');
export function parseGroupCategory(value: unknown, allowed: readonly { id: string }[]) {
  const id = searchSchema.parse(value);
  return allowed.some((category) => category.id === id) ? id : null;
}
