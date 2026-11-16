/** 직접 제작한 Lottie 도형. 두 웹 서비스가 같은 프레임과 색을 사용한다. */
const ORANGE = [1, 0.608, 0.259, 1];
const PAPER = [0.94, 0.925, 0.9, 1];
const INK = [0.38, 0.36, 0.34, 1];
const fixed = (k: number | number[]) => ({ a: 0, k });
interface IMotionKeyframe {
  t: number;
  s: number[];
  e?: number[];
  h?: number;
  i?: { x: number[]; y: number[] };
  o?: { x: number[]; y: number[] };
}
const tween = (
  from: number[],
  to: number[],
  end: number,
  start = 0,
): { a: number; k: IMotionKeyframe[] } => ({
  a: 1,
  k: [
    { t: start, s: from, e: to, i: { x: [0.45], y: [1] }, o: { x: [0.25], y: [0] } },
    { t: end, s: to },
  ],
});
const stroke = (color = ORANGE, width = 5) => ({
  ty: 'st',
  c: fixed(color),
  o: fixed(100),
  w: fixed(width),
  lc: 2,
  lj: 2,
});
const fill = (color = PAPER) => ({ ty: 'fl', c: fixed(color), o: fixed(100), r: 1 });
const ellipse = (x: number, y: number, w: number, h = w) => ({
  ty: 'el',
  p: fixed([x, y]),
  s: fixed([w, h]),
  d: 1,
});
const rect = (x: number, y: number, w: number, h: number, radius = 8) => ({
  ty: 'rc',
  p: fixed([x, y]),
  s: fixed([w, h]),
  r: fixed(radius),
  d: 1,
});
const path = (vertices: number[][], closed = false, incoming?: number[][], outgoing?: number[][]) => ({
  ty: 'sh',
  ks: {
    a: 0,
    k: {
      i: incoming ?? vertices.map(() => [0, 0]),
      o: outgoing ?? vertices.map(() => [0, 0]),
      v: vertices,
      c: closed,
    },
  },
});
type TMotionProperty = ReturnType<typeof fixed> | ReturnType<typeof tween>;
const transform = (x = 0, y = 0): Record<'o' | 'r' | 'p' | 'a' | 's', TMotionProperty> => ({
  o: fixed(100),
  r: fixed(0),
  p: fixed([x, y, 0]),
  a: fixed([0, 0, 0]),
  s: fixed([100, 100, 100]),
});
const layer = (name: string, shapes: Record<string, unknown>[], frames = 90, x = 50, y = 50) => ({
  ty: 4,
  nm: name,
  ind: 1,
  ip: 0,
  op: frames,
  st: 0,
  sr: 1,
  ks: transform(x, y),
  shapes,
});
const animation = (name: string, layers: ReturnType<typeof layer>[], frames = 90, w = 100, h = 100) => ({
  v: '5.13.0',
  fr: 30,
  ip: 0,
  op: frames,
  w,
  h,
  nm: name,
  ddd: 0,
  assets: [],
  layers: layers
    .slice()
    .reverse()
    .map((item, index) => ({ ...item, ind: index + 1 })),
});

const loading = animation(
  'Loading',
  [
    {
      ...layer(
        'Orbit',
        [ellipse(0, 0, 64), stroke(), { ty: 'tm', s: fixed(8), e: fixed(78), o: fixed(0), m: 1 }],
        45,
      ),
      ks: { ...transform(50, 50), r: tween([0], [360], 45) },
    },
  ],
  45,
);

const success = animation('Success', [
  layer('Ring', [ellipse(0, 0, 66), stroke()]),
  layer('Check', [
    path([
      [-17, 0],
      [-5, 12],
      [19, -14],
    ]),
    stroke(),
    { ty: 'tm', s: fixed(0), e: tween([0], [100], 25), o: fixed(0), m: 1 },
  ]),
]);

const error = animation('Attention', [
  layer('Ring', [ellipse(0, 0, 66), stroke()]),
  {
    ...layer('Mark', [
      path([
        [0, -15],
        [0, 5],
      ]),
      ellipse(0, 17, 5),
      stroke(),
    ]),
    ks: { ...transform(50, 50), s: tween([80, 80, 100], [100, 100, 100], 20) },
  },
]);

const empty = animation('Empty collection', [
  layer('Tray', [
    path(
      [
        [-34, -5],
        [-25, 22],
        [25, 22],
        [34, -5],
        [14, -5],
        [8, 4],
        [-8, 4],
        [-14, -5],
      ],
      true,
    ),
    fill(),
    stroke(),
  ]),
  {
    ...layer('Card', [
      rect(0, -17, 38, 29, 5),
      fill(),
      stroke(INK, 3),
      path([
        [-11, -13],
        [-3, -22],
        [10, -10],
      ]),
      stroke(ORANGE, 3),
    ]),
    ks: { ...transform(50, 50), p: tween([50, 42, 0], [50, 50, 0], 30) },
  },
]);

const offline = animation('Reconnect', [
  layer('Signal', [
    path(
      [
        [-28, -7],
        [0, -20],
        [28, -7],
      ],
      false,
      [
        [0, 0],
        [-12, 0],
        [-8, -8],
      ],
      [
        [8, -8],
        [12, 0],
        [0, 0],
      ],
    ),
    path(
      [
        [-16, 7],
        [0, 0],
        [16, 7],
      ],
      false,
      [
        [0, 0],
        [-6, 0],
        [-5, -4],
      ],
      [
        [5, -4],
        [6, 0],
        [0, 0],
      ],
    ),
    ellipse(0, 23, 5),
    stroke(),
  ]),
  {
    ...layer('Disconnect', [
      path([
        [-28, -28],
        [28, 28],
      ]),
      stroke(INK, 4),
    ]),
    ks: { ...transform(50, 50), o: tween([0], [100], 20) },
  },
]);

const game = animation('Game Mate', [
  layer('Controller', [rect(0, 0, 74, 46, 17), fill(), stroke(INK, 3)]),
  layer('D pad', [
    path([
      [-20, -8],
      [-20, 8],
    ]),
    path([
      [-28, 0],
      [-12, 0],
    ]),
    stroke(INK, 4),
  ]),
  {
    ...layer('Buttons', [ellipse(17, 5, 9), ellipse(27, -6, 9), fill(ORANGE)]),
    ks: { ...transform(50, 50), s: tween([85, 85, 100], [100, 100, 100], 25) },
  },
]);

const cat = animation(
  'Afternoon cat',
  [
    layer('Sofa', [rect(0, 15, 168, 62, 15), fill(PAPER)], 150, 100, 80),
    layer(
      'Cat',
      [
        ellipse(-2, 7, 91, 38),
        ellipse(42, -4, 43, 39),
        path(
          [
            [23, -12],
            [25, -35],
            [40, -22],
          ],
          true,
        ),
        path(
          [
            [43, -23],
            [60, -34],
            [60, -9],
          ],
          true,
        ),
        fill(ORANGE),
      ],
      150,
      100,
      80,
    ),
    {
      ...layer(
        'Tail',
        [
          path(
            [
              [-43, 11],
              [-69, -4],
              [-66, -24],
            ],
            false,
            [
              [0, 0],
              [6, 16],
              [-12, 0],
            ],
            [
              [-15, 0],
              [-5, -10],
              [0, 0],
            ],
          ),
          stroke(ORANGE, 10),
        ],
        150,
        100,
        80,
      ),
      ks: {
        ...transform(100, 80),
        r: {
          a: 1,
          k: [
            { t: 0, s: [-3], e: [4], i: { x: [0.5], y: [1] }, o: { x: [0.5], y: [0] } },
            { t: 75, s: [4], e: [-3], i: { x: [0.5], y: [1] }, o: { x: [0.5], y: [0] } },
            { t: 150, s: [-3] },
          ],
        },
      },
    },
    {
      ...layer('Sleepy eyes', [ellipse(-5, 0, 4, 7), ellipse(12, 0, 4, 7), fill(INK)], 150, 139, 73),
      ks: {
        ...transform(139, 73),
        s: {
          a: 1,
          k: [
            { t: 0, s: [100, 100, 100], h: 1 },
            { t: 60, s: [100, 15, 100], h: 1 },
            { t: 65, s: [100, 100, 100], h: 1 },
          ],
        },
      },
    },
  ],
  150,
  200,
  160,
);

export const MOTION_ANIMATIONS = { loading, success, error, empty, offline, game, cat } satisfies Record<
  string,
  ReturnType<typeof animation>
>;
export type TMotionVariant = keyof typeof MOTION_ANIMATIONS;
