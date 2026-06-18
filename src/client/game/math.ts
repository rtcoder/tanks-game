import type { Point, Tank } from '../../shared/types';

export const round = (num: number, decimalPlaces = 0): number => {
  const value = 10 ** decimalPlaces;
  return Math.round((num + Number.EPSILON) * value) / value;
};

export const radiansToDegrees = (radians: number): number => radians * (180 / Math.PI);
export const degreesToRadians = (degrees: number): number => (degrees / 180) * Math.PI;

export const getRectangleCornerPointsAfterRotate = (tank: Tank): Required<Point>[] => {
  const { x, y, width, height, angle } = tank;
  const radius = Math.sqrt((width / 2) ** 2 + (height / 2) ** 2);
  const beta = radiansToDegrees(Math.atan2(height, width));
  const gammas = [
    degreesToRadians(beta + angle),
    degreesToRadians(beta + angle + radiansToDegrees(Math.PI)),
    degreesToRadians(-beta + angle + radiansToDegrees(Math.PI)),
    degreesToRadians(-beta + angle),
  ];

  return gammas.map((gamma) => ({
    x: x + radius * Math.cos(gamma),
    y: y + radius * Math.sin(gamma),
    gamma: (radiansToDegrees(gamma) + 720) % 360,
  }));
};
