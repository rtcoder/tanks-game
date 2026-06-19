import type { DestructibleSegment, Wall, WaterField } from '../../shared/types';

export const createWalls = (): Wall[] => [];

export const createWaterFields = (): WaterField[] => [];

export const createDestructibleSegments = (): DestructibleSegment[] => {
  const segments: DestructibleSegment[] = [];
  const segmentSize = 80;
  const columns = 7;
  const rows = 5;
  const originX = 5000 - (columns * segmentSize) / 2;
  const originY = 5000 - (rows * segmentSize) / 2;

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      segments.push({
        id: `building-a:${column}:${row}`,
        x: originX + column * segmentSize,
        y: originY + row * segmentSize,
        width: segmentSize,
        height: segmentSize,
      });
    }
  }

  return segments;
};
