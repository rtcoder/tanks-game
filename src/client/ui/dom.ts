export const queryElement = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
};

export const queryById = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id) as T | null;
  if (!element) {
    throw new Error(`Missing required element: #${id}`);
  }
  return element;
};

export const getContext = (canvasElement: HTMLCanvasElement): CanvasRenderingContext2D => {
  const context = canvasElement.getContext('2d');
  if (!context) {
    throw new Error('2D canvas context is not available');
  }
  return context;
};

export const dom = {
  joyStick: queryElement<HTMLElement>('.joystick'),
  joyStickDot: queryElement<HTMLElement>('.joystick .dot'),
  wrapper: queryElement<HTMLElement>('.wrapper'),
  menuBoard: queryById<HTMLElement>('menu-board'),
  controlsPanel: queryById<HTMLElement>('controls-panel'),
  createBattleButton: queryById<HTMLButtonElement>('create-battle-button'),
  joinBattleButton: queryById<HTMLButtonElement>('join-battle-button'),
  controlsButton: queryById<HTMLButtonElement>('controls-button'),
  respawnButton: queryById<HTMLButtonElement>('respawn-button'),
  gameOverPanel: queryById<HTMLElement>('game-over'),
  hpFill: queryById<HTMLElement>('hp-fill'),
  hpValue: queryById<HTMLElement>('hp-value'),
  mineStatus: queryById<HTMLElement>('mine-status'),
  playersCount: queryById<HTMLElement>('players-count'),
  nickInput: queryById<HTMLInputElement>('nick-input'),
  battleTitleInput: queryById<HTMLInputElement>('battle-title-input'),
  maxPlayersInput: queryById<HTMLInputElement>('max-players-input'),
  battleIdInput: queryById<HTMLInputElement>('battle-id-input'),
  battleStatusText: queryById<HTMLElement>('battle-status-text'),
  touchMineButton: queryById<HTMLButtonElement>('touch-mine'),
  minimapContainer: queryElement<HTMLElement>('.minimap'),
  canvas: queryById<HTMLCanvasElement>('canvas'),
  canvasMinimap: queryById<HTMLCanvasElement>('canvas-minimap'),
  canvasWalls: queryById<HTMLCanvasElement>('canvas-walls'),
  canvasWallsMinimap: queryById<HTMLCanvasElement>('canvas-walls-minimap'),
};

export const contexts = {
  ctxMinimap: getContext(dom.canvasMinimap),
  ctxWalls: getContext(dom.canvasWalls),
  ctxWallsMinimap: getContext(dom.canvasWallsMinimap),
};
