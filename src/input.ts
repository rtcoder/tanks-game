import type { KeysState } from './types';

export const switchKey = (keys: KeysState, event: KeyboardEvent, value: boolean): void => {
  switch (event.code) {
    case 'KeyW':
    case 'ArrowUp':
      keys.w = value;
      break;
    case 'KeyS':
    case 'ArrowDown':
      keys.s = value;
      break;
    case 'KeyA':
    case 'ArrowLeft':
      keys.a = value;
      break;
    case 'KeyD':
    case 'ArrowRight':
      keys.d = value;
      break;
    case 'ShiftLeft':
    case 'ShiftRight':
      keys.shift = value;
      break;
    case 'Space':
      keys.space = value;
      break;
  }
};

export const clearKeys = (keys: KeysState): void => {
  Object.keys(keys).forEach((key) => {
    keys[key as keyof KeysState] = false;
  });
};
