import { z } from 'zod';

export const WIDTH = 368;
export const HEIGHT = 652;
export const rectSchema = z.object({
  x: z.int().nonnegative(),
  y: z.int().nonnegative(),
  width: z.int().positive(),
  height: z.int().positive(),
});
export type Rect = z.infer<typeof rectSchema>;
export type Point = { x: number; y: number };

export function center(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}
