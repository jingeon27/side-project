import type { Category } from './types';

export const categories = [
  'engineering',
  'til',
  'perspectives',
  'misc',
] as const satisfies readonly Category[];
