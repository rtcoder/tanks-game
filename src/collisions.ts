import type { Mine, Point, Tank, WaterField } from './types';

export const isPointInWater = (
  context: CanvasRenderingContext2D,
  waterFields: WaterField[],
  points: Point[],
): boolean => waterFields.some((waterField) => (
  points.some((point) => context.isPointInPath(waterField.getPath(), point.x, point.y))
));

export const circleRectColliding = (
  circle: Mine,
  rect: Point & Partial<Pick<Tank, 'width' | 'height'>>,
): boolean => {
  const width = rect.width ?? 1;
  const height = rect.height ?? 1;
  const distX = Math.abs(circle.x - rect.x - width / 2);
  const distY = Math.abs(circle.y - rect.y - height / 2);

  if (distX > width / 2 + circle.size || distY > height / 2 + circle.size) {
    return false;
  }
  if (distX <= width / 2 || distY <= height / 2) {
    return true;
  }

  const dx = distX - width / 2;
  const dy = distY - height / 2;
  return dx * dx + dy * dy <= circle.size * circle.size;
};

export const isMineArmed = ({ time }: Mine, armMs: number): boolean => Date.now() - time > armMs;
