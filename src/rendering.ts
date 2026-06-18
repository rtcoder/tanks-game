import type { RadiusConfig } from './types';

export const roundRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number | Partial<RadiusConfig> = 5,
  fillColor?: string,
  strokeColor?: string,
): void => {
  const radii: RadiusConfig = typeof radius === 'number'
    ? { tl: radius, tr: radius, br: radius, bl: radius }
    : { tl: radius.tl ?? 0, tr: radius.tr ?? 0, br: radius.br ?? 0, bl: radius.bl ?? 0 };

  context.beginPath();
  context.moveTo(x + radii.tl, y);
  context.lineTo(x + width - radii.tr, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radii.tr);
  context.lineTo(x + width, y + height - radii.br);
  context.quadraticCurveTo(x + width, y + height, x + width - radii.br, y + height);
  context.lineTo(x + radii.bl, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radii.bl);
  context.lineTo(x, y + radii.tl);
  context.quadraticCurveTo(x, y, x + radii.tl, y);
  context.closePath();

  if (fillColor) {
    context.fillStyle = fillColor;
    context.fill();
  }

  if (strokeColor) {
    context.strokeStyle = strokeColor;
    context.stroke();
  }
};

export const hexToRgb = (hex: string): [number, number, number] => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    return [0, 0, 0];
  }
  return [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16),
  ];
};

export const shiftColor = ([r, g, b]: [number, number, number], val: number, percent: number): string => (
  `#${
    ((0 | (1 << 8) + r + ((val - r) * percent) / 100).toString(16)).substr(1)
  }${
    ((0 | (1 << 8) + g + ((val - g) * percent) / 100).toString(16)).substr(1)
  }${
    ((0 | (1 << 8) + b + ((val - b) * percent) / 100).toString(16)).substr(1)
  }`
);

export const lighterColor = (color: string, percent: number): string => shiftColor(hexToRgb(color), 256, percent);

export const getRandomColor = (): string => `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;
