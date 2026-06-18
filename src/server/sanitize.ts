import crypto from 'crypto';
import type {Mine, Tank} from '../shared/types.ts';
import {GAME_BOUNDS} from './config.ts';

export function clamp(value: unknown, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return min;
  }
  return Math.min(Math.max(number, min), max);
}

export function sanitizeText(value: unknown, fallback: string, maxLength: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    return fallback;
  }
  return text.slice(0, maxLength);
}

export function sanitizeColor(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '#4f8cff';
}

export function sanitizePlayerId(playerId: unknown): string {
  return typeof playerId === 'string' && playerId.length >= 8 && playerId.length <= 80
    ? playerId
    : crypto.randomUUID();
}

export function sanitizeTank(tank: any, uid: string): Tank {
  return {
    uid,
    lives: clamp(tank?.lives, 0, 100),
    x: clamp(tank?.x, 25, GAME_BOUNDS.width - 25),
    y: clamp(tank?.y, 25, GAME_BOUNDS.height - 25),
    speed: clamp(tank?.speed, 1, 8),
    angle: clamp(tank?.angle, 0, 360),
    mod: clamp(tank?.mod, -1, 1),
    tracksShift: Array.isArray(tank?.tracksShift) ? tank.tracksShift.slice(0, 2) : [0, 0],
    traces: Array.isArray(tank?.traces) ? tank.traces.slice(-80) : [],
    width: clamp(tank?.width, 20, 80),
    height: clamp(tank?.height, 20, 80),
    color: sanitizeColor(tank?.color),
    velocity: {
      x: clamp(tank?.velocity?.x, -600, 600),
      y: clamp(tank?.velocity?.y, -600, 600),
    },
    friction: clamp(tank?.friction, 0.75, 0.99),
    force: clamp(tank?.force, 20, 160),
  };
}

export function sanitizeMine(mine: any): Mine {
  return {
    x: clamp(mine?.x, 0, GAME_BOUNDS.width),
    y: clamp(mine?.y, 0, GAME_BOUNDS.height),
    size: clamp(mine?.size, 8, 40),
    time: clamp(mine?.time, 0, Date.now()),
    ownerUid: typeof mine?.ownerUid === 'string' ? mine.ownerUid : null,
  };
}
