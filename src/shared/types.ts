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

export enum BattleMode {
  Ffa = 'ffa',
  Teams = 'teams',
}
export enum BattleStatus {
  Waiting = 'waiting',
  Active = 'active',
  Finished = 'finished',
}

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

export enum ImageKey {
  BLOCK_1 = 'BLOCK_1',
  BLOCK_2 = 'BLOCK_2',
  WATER = 'WATER',
  MUD = 'MUD',
}

export enum WsMessageType {
  SetId = 'SET_ID',
  BattleState = 'BATTLE_STATE',
  TanksData = 'TANKS_DATA',
  MinesData = 'MINES_DATA',
}
export type WsMessageSetId = { type: WsMessageType.SetId; payload: { id: string; battle: BattleSummary } };
export type WsMessageBattleState = { type: WsMessageType.BattleState; payload: { battle: BattleSummary } };
export type WsMessageTanksData = { type: WsMessageType.TanksData; payload: { tanks: Tank[] } };
export type WsMessageMinesData = { type: WsMessageType.MinesData; payload: { mines: Mine[] } };

export type WsMessage =
  | WsMessageSetId
  | WsMessageBattleState
  | WsMessageTanksData
  | WsMessageMinesData;

export enum ClientMessageType {
  AddTank = 'ADD_TANK',
  LeftGame = 'LEFT_GAME',
  UpdateTank = 'UPDATE_TANK',
  UpdateMines = 'UPDATE_MINES',
}
export type ClientMessageAddTank = { type: ClientMessageType.AddTank; payload: { tank: Tank } };
export type ClientMessageLeftGame = { type: ClientMessageType.LeftGame; payload: { uid: string | null } };
export type ClientMessageUpdateTank = { type: ClientMessageType.UpdateTank; payload: { tank: Tank } };
export type ClientMessageUpdateMines = { type: ClientMessageType.UpdateMines; payload: { mines: Mine[] } };

export type ClientMessage =
  | ClientMessageAddTank
  | ClientMessageLeftGame
  | ClientMessageUpdateTank
  | ClientMessageUpdateMines;

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

export type SerializedBattle = {
  id: string;
  title: string;
  mode: BattleMode;
  status: BattleStatus;
  maxPlayers: number;
  createdAt: string;
  winnerUid: string | null;
  players: Array<{
    id: string;
    nick: string;
    connected: boolean;
    alive: boolean;
  }>;
};

export type Request = {
  url?: string;
  method?: string;
  headers: {
    host?: string;
  };
  on: (event: string, listener: (chunk?: Buffer | Error) => void) => void;
  destroy: () => void;
};

export type Response = {
  writeHead: (statusCode: number, headers: Record<string, string>) => void;
  write: (chunk: unknown) => void;
  end: (data?: string) => void;
};

export type WebSocketClient = {
  readyState: number;
  battleId?: string;
  battle?: Battle;
  player?: Player;
  uid?: string;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  on: (event: string, listener: (data?: unknown) => void) => void;
};

export type Player = {
  id: string;
  nick: string;
  connected: boolean;
  lastSeen: string | null;
  tank: Tank | null;
};

export type Battle = {
  id: string;
  title: string;
  mode: BattleMode;
  status: BattleStatus;
  maxPlayers: number;
  createdAt: string;
  winnerUid: string | null;
  players: Map<string, Player>;
  mines: Mine[];
};

export type PlayerPayload = {
  nick?: unknown;
  playerId?: unknown;
};

export type CreateBattlePayload = PlayerPayload & {
  title?: unknown;
  maxPlayers?: unknown;
};

export type ApiError = Error & {
  statusCode?: number;
};
