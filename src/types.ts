export type KeysState = {
  w: boolean;
  s: boolean;
  a: boolean;
  d: boolean;
  shift: boolean;
  space: boolean;
};

export type Point = {
  x: number;
  y: number;
  gamma?: number;
};

export type Trace = {
  x: number;
  y: number;
  angle: number;
  time: number;
};

export type Tank = {
  uid: string | null;
  lives: number;
  x: number;
  y: number;
  speed: number;
  angle: number;
  mod: number;
  tracksShift: [number, number];
  traces: Trace[];
  width: number;
  height: number;
  color: string;
  velocity: Point;
  friction: number;
  force: number;
  drawDot?: boolean;
};

export type Mine = {
  x: number;
  y: number;
  size: number;
  time: number;
  ownerUid?: string | null;
};

export type BattleMode = 'ffa' | 'teams';
export type BattleStatus = 'waiting' | 'active' | 'finished';

export type BattlePlayer = {
  id: string;
  nick: string;
  connected: boolean;
  alive: boolean;
};

export type BattleSummary = {
  id: string;
  title: string;
  mode: BattleMode;
  status: BattleStatus;
  maxPlayers: number;
  createdAt: string;
  winnerUid: string | null;
  players: BattlePlayer[];
};

export type Wall = {
  x: number;
  y: number;
  width: number;
  height: number;
  path: Path2D;
};

export type WaterField = {
  getPath: () => Path2D;
};

export type ImageKey = 'BLOCK_1' | 'BLOCK_2' | 'WATER' | 'MUD';

export type WsMessage =
  | { type: 'SET_ID'; payload: { id: string; battle: BattleSummary } }
  | { type: 'BATTLE_STATE'; payload: { battle: BattleSummary } }
  | { type: 'TANKS_DATA'; payload: { tanks: Tank[] } }
  | { type: 'MINES_DATA'; payload: { mines: Mine[] } };

export type ClientMessage =
  | { type: 'ADD_TANK'; payload: { tank: Tank } }
  | { type: 'LEFT_GAME'; payload: { uid: string | null } }
  | { type: 'UPDATE_TANK'; payload: { tank: Tank } }
  | { type: 'UPDATE_MINES'; payload: { mines: Mine[] } };

export type RadiusConfig = {
  tl: number;
  tr: number;
  br: number;
  bl: number;
};

export type GameConfig = {
  gameBounds: {
    width: number;
    height: number;
  };
  playerSpawn: {
    x: number;
    y: number;
    angle: number;
  };
  webSocketPath: string;
};
