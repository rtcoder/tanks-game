import type {Point} from '../../shared/types';

const ISO_X_SCALE = 0.5;
const ISO_Y_SCALE = 0.25;

export const worldToIso = ({x, y}: Point): Point => ({
  x: (x - y) * ISO_X_SCALE,
  y: (x + y) * ISO_Y_SCALE,
});

export const worldToScreen = (point: Point, cameraShift: Point): Point => {
  const iso = worldToIso(point);
  return {
    x: iso.x + cameraShift.x,
    y: iso.y + cameraShift.y,
  };
};

export const rotatePoint = (point: Point, center: Point, angle: number): Point => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - center.x;
  const dy = point.y - center.y;

  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
};

export const applyIsoWorldTransform = (
  context: CanvasRenderingContext2D,
  cameraShift: Point,
): void => {
  context.setTransform(
    ISO_X_SCALE,
    ISO_Y_SCALE,
    -ISO_X_SCALE,
    ISO_Y_SCALE,
    cameraShift.x,
    cameraShift.y,
  );
};

export const applyIsoCameraTransform = (
  context: CanvasRenderingContext2D,
  cameraShift: Point,
  center: Point,
  rotation: number,
): void => {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  context.setTransform(
    cos * ISO_X_SCALE - sin * ISO_Y_SCALE,
    sin * ISO_X_SCALE + cos * ISO_Y_SCALE,
    -cos * ISO_X_SCALE - sin * ISO_Y_SCALE,
    -sin * ISO_X_SCALE + cos * ISO_Y_SCALE,
    center.x + cos * (cameraShift.x - center.x) - sin * (cameraShift.y - center.y),
    center.y + sin * (cameraShift.x - center.x) + cos * (cameraShift.y - center.y),
  );
};

export const getIsoCameraShift = (
  target: Point,
  canvas: HTMLCanvasElement,
): Point => {
  const projectedTarget = worldToIso(target);
  return {
    x: canvas.width / 2 - projectedTarget.x,
    y: canvas.height * 0.48 - projectedTarget.y,
  };
};

export const getProjectedDirectionAngle = (angle: number): number => {
  const angleRadians = (Math.PI / 180) * angle;
  const projected = worldToIso({
    x: Math.cos(angleRadians),
    y: Math.sin(angleRadians),
  });
  return Math.atan2(projected.y, projected.x);
};

export const isoDepth = ({x, y}: Point): number => x + y;
