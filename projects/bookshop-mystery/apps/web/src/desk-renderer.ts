import {
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  WebGLRenderer,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

import desk from '../../unity/Assets/Resources/Bookshop/desk.json';
import { front, printerIds, type IOrientation, type TProp } from './case-file';
import { createPrinterFraming } from './printer-framing';

const textures = import.meta.glob('../../unity/Assets/Resources/Bookshop/*.png', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const radians = (degrees: number) => (degrees * Math.PI) / 180;
export type TShot = TProp | 'closed' | 'paper-lower';

export async function createDeskRenderer(
  canvas: HTMLCanvasElement,
  { interactive = false }: { interactive?: boolean } = {},
) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  const scene = new Scene();
  scene.background = new Color('#1e211c');
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;

  const textureLoader = new TextureLoader();
  const loadedTextures = await Promise.all(
    Object.entries(textures).map(async ([path, url]) => {
      const texture = await textureLoader.loadAsync(url);
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      return [path.split('/').at(-1)?.replace('.png', ''), texture] as const;
    }),
  ).catch(() => []);
  const textureMap = new Map(loadedTextures);
  const groups = new Map<string, Group>();
  const table = new Group();
  groups.set('desk', table);
  scene.add(table);
  for (const item of desk.objects) {
    const object = new Group();
    groups.set(item.id, object);
    scene.add(object);
  }

  for (const part of desk.parts) {
    const [width = 1, height = 1, length = 1] = part.scale;
    const geometry = {
      plane: () => new PlaneGeometry(width, height),
      cylinder: () => new CylinderGeometry(width / 2, width / 2, height, 24),
      box: () =>
        part.group.startsWith('printer') && Math.min(width, height, length) > 0.1
          ? new RoundedBoxGeometry(width, height, length, 3, Math.min(width, height, length) * 0.19)
          : new BoxGeometry(width, height, length),
    }[part.shape as 'plane' | 'cylinder' | 'box']();
    const map = textureMap.get(part.texture) ?? null;
    const material =
      part.shape === 'plane' && part.texture !== 'walnut'
        ? new MeshBasicMaterial({ color: part.color, map, side: DoubleSide, toneMapped: false })
        : new MeshStandardMaterial({ color: part.color, map, roughness: 0.78 });
    const mesh = new Mesh(geometry, material);
    mesh.position.fromArray(part.position);
    mesh.rotation.set(
      radians(part.rotation[0] ?? 0),
      radians(part.rotation[1] ?? 0),
      radians(part.rotation[2] ?? 0),
      'YXZ',
    );
    if (interactive && part.texture.startsWith('serial-')) mesh.scale.setScalar(1.16);
    groups.get(part.group)?.add(mesh);
  }

  const printerFraming = new Map<TProp, ReturnType<typeof createPrinterFraming>>(
    interactive
      ? printerIds.flatMap((id) => {
          const group = groups.get(id);
          return group ? [[id, createPrinterFraming(group)] as const] : [];
        })
      : [],
  );

  const warmth = new DirectionalLight('#ffd5a1', 2.35);
  warmth.position.set(-3.2, 5, 2.4);
  const rim = new DirectionalLight('#acc4c2', 1.25);
  rim.position.set(4.5, 3.2, -2);
  scene.add(new AmbientLight('#b5a395', 1.08), warmth, rim);
  const map = makeContactShadow();
  const shadows = desk.objects.map((item) => {
    const mesh = new Mesh(
      new PlaneGeometry(2.7, 2.5),
      new MeshBasicMaterial({
        map,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    mesh.position.set(item.position[0] ?? 0, 0.006, item.position[2] ?? 0);
    mesh.rotation.x = -Math.PI / 2;
    scene.add(mesh);
    return [item.id, mesh] as const;
  });

  const camera = new PerspectiveCamera(36, 1, 0.03, 45);
  const viewport = new Vector2();

  function point(x: number, y: number, z: number, atX: number, atY: number, atZ: number) {
    camera.position.set(x, y, z);
    camera.lookAt(atX, atY, atZ);
  }

  function pose(view: TProp, orientation: IOrientation) {
    for (const item of desk.objects) {
      const group = groups.get(item.id);
      if (!group) continue;
      group.visible = view === 'desk' || view === item.id;
      group.position.fromArray(item.position);
      group.rotation.set(0, radians(item.angle), 0, 'YXZ');
    }
    for (const [id, shadow] of shadows) {
      shadow.visible = view === 'desk';
      if (view === id) {
        shadow.visible = true;
        shadow.position.set(0, 0.006, 0);
        continue;
      }
      const original = desk.objects.find((item) => item.id === id);
      if (original) shadow.position.set(original.position[0] ?? 0, 0.006, original.position[2] ?? 0);
    }
    if (view === 'desk') {
      point(0.15, 6.05, 6.2, 0.17, 0.1, -0.45);
      return;
    }
    const group = groups.get(view);
    if (group) {
      group.position.set(0, 0.42, 0);
      group.rotation.set(
        radians((orientation.underside ? -164 : 0) + orientation.pitch),
        radians(orientation.yaw),
        0,
        'YXZ',
      );
    }
    point(0.12, 3.6, 3.85, 0, 0.48, 0);
  }

  function resize(width: number, height: number, density = 1) {
    renderer.setPixelRatio(density);
    renderer.setSize(width, height, false);
    viewport.set(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function draw(view: TProp, orientation: IOrientation) {
    pose(view, orientation);
    if (interactive) {
      camera.zoom = Math.min(1, camera.aspect);
      camera.clearViewOffset();
      printerFraming.get(view)?.(camera, viewport);
    }
    renderer.render(scene, camera);
  }

  function capture(shot: TShot, at: number, portrait: boolean) {
    if (shot === 'closed') {
      pose('desk', front);
      point(-2.8 - at * 0.15, 3.85 - at * 0.3, -0.8, -3.1, 0.08, -2.7);
    }
    if (shot === 'desk') {
      pose('desk', front);
      if (portrait) point(0.2 - at * 0.5, 6.3 - at * 0.35, 6.4 - at * 0.5, 0.15, 0.1, -0.45);
    }
    if (shot === 'record') {
      pose('record', front);
      if (portrait) point(at * 0.38, 4.8 - at * 0.22, 3.45, 0, 0.46, 0);
    }
    if (shot === 'printer-a' || shot === 'printer-b') {
      pose(shot, { ...front, underside: true, yaw: 28 - at * 26 });
      if (portrait) point(0.04, 4.5, 4.45, 0, 0.47, 0);
    }
    if (shot === 'receipt' || shot === 'paper-lower') {
      pose('receipt', front);
      if (portrait)
        point(
          0.18 - 0.13 * at,
          4.8 - 0.44 * at,
          2.75 - 0.3 * at,
          0,
          0.54,
          shot === 'paper-lower' ? 0.24 : -0.32,
        );
    }
    renderer.render(scene, camera);
  }

  function dispose() {
    map.dispose();
    for (const texture of textureMap.values()) texture.dispose();
    scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        material.dispose();
      }
      object.geometry.dispose();
    });
    renderer.dispose();
  }

  function turnPrinter(view: 'printer-a' | 'printer-b', at: number) {
    pose(view, { ...front, yaw: 16 - at * 16 });
    const object = groups.get(view);
    if (object) object.rotation.x = -Math.PI * 0.92 * at;
    renderer.render(scene, camera);
  }

  return { draw, resize, capture, turnPrinter, dispose };
}

function makeContactShadow() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(32, 32, 8, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(12, 9, 8, 0.65)');
    gradient.addColorStop(1, 'rgba(12, 9, 8, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  }
  return new CanvasTexture(canvas);
}
