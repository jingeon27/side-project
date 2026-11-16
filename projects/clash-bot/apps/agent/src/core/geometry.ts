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

// Screen-to-tile calibration: 18×32 tiles, river at y=16, princess towers at (3.5,6.5).
export const tilePoint = (profile: { riverY: number }, point: Point): [number, number] => [
  Math.round((9 + ((point.x - 184) * 11) / 178) * 10) / 10,
  Math.round((16 - ((point.y - profile.riverY) * 9.5) / 130) * 10) / 10,
];

export const screenPoint = (profile: { riverY: number }, [x, y]: readonly [number, number]): Point => ({
  x: 184 + ((x - 9) * 178) / 11,
  y: profile.riverY + ((16 - y) * 130) / 9.5,
});
