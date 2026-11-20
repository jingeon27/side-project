import { z } from 'zod';

export const WIDTH = 368;
export const HEIGHT = 652;
export const rectSchema = z.object({
  x: z.int().nonnegative(),
  y: z.int().nonnegative(),
  width: z.int().positive(),
  height: z.int().positive(),
});
export type Point = { x: number; y: number };

export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

// Screen-to-tile calibration: 18×32 tiles, river at y=16, princess towers at (3.5,6.5).
type Projection = { riverY: number; tileScale?: { x: number; y: number } };
export const projectionScale = (profile: Projection) => profile.tileScale ?? { x: 178 / 11, y: 130 / 9.5 };
export const tilePoint = (profile: Projection, point: Point): [number, number] => [
  Math.round((9 + (point.x - 184) / projectionScale(profile).x) * 10) / 10,
  Math.round((16 - (point.y - profile.riverY) / projectionScale(profile).y) * 10) / 10,
];

export const screenPoint = (profile: Projection, [x, y]: readonly [number, number]): Point => ({
  x: 184 + (x - 9) * projectionScale(profile).x,
  y: profile.riverY + (16 - y) * projectionScale(profile).y,
});
