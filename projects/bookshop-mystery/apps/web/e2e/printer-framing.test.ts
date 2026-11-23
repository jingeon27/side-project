import { expect, test } from '@playwright/test';
import { Box3, BoxGeometry, Group, Mesh, PerspectiveCamera, Vector2, Vector3 } from 'three';

import { createPrinterFraming } from '../src/printer-framing';

const radians = (angle: number) => (angle * Math.PI) / 180;

test('회전 중 프린터 전체가 여백 안에 들어오고 기본 밑면은 확대된다', () => {
  const geometry = new BoxGeometry(1.85, 0.805, 1.553).translate(0, 0.3175, 0.015);
  const printer = new Group();
  const mesh = new Mesh(geometry);
  printer.add(mesh);
  const frame = createPrinterFraming(printer);
  printer.position.set(0, 0.42, 0);
  const positions = geometry.getAttribute('position');

  function project(camera: PerspectiveCamera) {
    printer.updateMatrixWorld();
    const points = Array.from({ length: positions.count }, (_, index) =>
      new Vector3().fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld).project(camera),
    );
    return new Box3().setFromPoints(points);
  }

  const viewports = [new Vector2(290, 226), new Vector2(360, 501), new Vector2(400, 589)];
  for (const viewport of viewports) {
    const camera = new PerspectiveCamera(36, viewport.x / viewport.y, 0.03, 45);
    camera.position.set(0.12, 3.6, 3.85);
    camera.lookAt(0, 0.48, 0);
    camera.updateMatrixWorld();
    for (const basePitch of [0, -164]) {
      for (const tilt of [-30, 0, 30]) {
        for (const yaw of Array.from({ length: 15 }, (_, index) => index * 24)) {
          printer.rotation.set(radians(basePitch + tilt), radians(yaw), 0, 'YXZ');
          camera.zoom = Math.min(1, camera.aspect);
          camera.clearViewOffset();
          const before = project(camera);
          frame(camera, viewport);
          const bounds = project(camera);
          expect(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x))).toBeLessThan(0.94);
          expect(Math.max(Math.abs(bounds.min.y), Math.abs(bounds.max.y))).toBeLessThan(0.94);
          if (basePitch !== 0 && tilt === 0 && yaw === 0) {
            expect(bounds.max.x - bounds.min.x).toBeGreaterThan((before.max.x - before.min.x) * 1.2);
          }
        }
      }
    }
  }
  mesh.material.dispose();
  geometry.dispose();
});
