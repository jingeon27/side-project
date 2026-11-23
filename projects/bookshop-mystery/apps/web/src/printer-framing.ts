import { Box3, Vector3, type Group, type PerspectiveCamera, type Vector2 } from 'three';

export function createPrinterFraming(group: Group) {
  const { min, max } = new Box3().setFromObject(group);
  const corners = [min.x, max.x].flatMap((x) =>
    [min.y, max.y].flatMap((y) => [min.z, max.z].map((z) => new Vector3(x, y, z))),
  );
  const projectedBounds = new Box3();
  const point = new Vector3();

  return (camera: PerspectiveCamera, viewport: Vector2) => {
    camera.updateMatrixWorld();
    group.updateWorldMatrix(true, false);
    projectedBounds.makeEmpty();
    for (const corner of corners) {
      projectedBounds.expandByPoint(point.copy(corner).applyMatrix4(group.matrixWorld).project(camera));
    }

    const size = projectedBounds.getSize(point);
    const margin = Math.min(18, Math.min(viewport.x, viewport.y) * 0.06);
    const scale = Math.min(
      1.5,
      (2 * (1 - (2 * margin) / viewport.x)) / size.x,
      (2 * (1 - (2 * margin) / viewport.y)) / size.y,
    );
    const center = projectedBounds.getCenter(point);
    camera.zoom *= scale;
    camera.setViewOffset(
      viewport.x,
      viewport.y,
      (center.x * scale * viewport.x) / 2,
      (-center.y * scale * viewport.y) / 2,
      viewport.x,
      viewport.y,
    );
  };
}
