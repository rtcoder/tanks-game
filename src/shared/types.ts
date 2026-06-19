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

export type BattleProjectile = {
  id: string;
  x: number;
  y: number;
  angle: number;
  distance: number;
  ownerUid: string | null;
  attack?: number;
};

export type DestructibleSegment = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  level: number;
  texture: string;
};

export type MapBuilding = {
  id: string;
  x: number;
  y: number;
  columns: number;
  rows: number;
  segmentSize: number;
  levels: number;
  texture: string;
};

export type MapObstacle = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  levels: number;
  texture: string;
};

export type TerrainPatch = {
  id: string;
  x: number;
  y: number;
  radius: number;
  kind: 'hill' | 'pit' | 'rough';
};

export type MapDefinition = {
  version: 1;
  name: string;
  width: number;
  height: number;
  groundTexture: string;
  buildings: MapBuilding[];
  obstacles: MapObstacle[];
  terrainPatches: TerrainPatch[];
};

export const BattleMode = {
  Ffa: 'ffa',
  Teams: 'teams',
} as const;
export type BattleMode = typeof BattleMode[keyof typeof BattleMode];

export const BattleStatus = {
  Waiting: 'waiting',
  Active: 'active',
  Finished: 'finished',
} as const;
export type BattleStatus = typeof BattleStatus[keyof typeof BattleStatus];

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
  levels?: number;
  texture?: string;
  path: Path2D;
};

export type WaterField = {
  getPath: () => Path2D;
  visuals: Array<{
    x: number;
    y: number;
    rx: number;
    ry: number;
  }>;
};

export const ImageKey = {
  BLOCK_1: 'BLOCK_1',
  BLOCK_2: 'BLOCK_2',
  WATER: 'WATER',
  MUD: 'MUD',
} as const;
export type ImageKey = typeof ImageKey[keyof typeof ImageKey];

export const WsMessageType = {
  SetId: 'SET_ID',
  BattleState: 'BATTLE_STATE',
  TanksData: 'TANKS_DATA',
  MinesData: 'MINES_DATA',
  ProjectilesData: 'PROJECTILES_DATA',
  DestructiblesData: 'DESTRUCTIBLES_DATA',
} as const;
export type WsMessageType = typeof WsMessageType[keyof typeof WsMessageType];
export type WsMessageSetId = { type: typeof WsMessageType.SetId; payload: { id: string; battle: BattleSummary } };
export type WsMessageBattleState = { type: typeof WsMessageType.BattleState; payload: { battle: BattleSummary } };
export type WsMessageTanksData = { type: typeof WsMessageType.TanksData; payload: { tanks: Tank[] } };
export type WsMessageMinesData = { type: typeof WsMessageType.MinesData; payload: { mines: Mine[] } };
export type WsMessageProjectilesData = {
  type: typeof WsMessageType.ProjectilesData;
  payload: { projectiles: BattleProjectile[] };
};
export type WsMessageDestructiblesData = {
  type: typeof WsMessageType.DestructiblesData;
  payload: { destroyedSegmentIds: string[] };
};

export type WsMessage =
  | WsMessageSetId
  | WsMessageBattleState
  | WsMessageTanksData
  | WsMessageMinesData
  | WsMessageProjectilesData
  | WsMessageDestructiblesData;

export const ClientMessageType = {
  AddTank: 'ADD_TANK',
  LeftGame: 'LEFT_GAME',
  UpdateTank: 'UPDATE_TANK',
  UpdateMines: 'UPDATE_MINES',
  UpdateProjectiles: 'UPDATE_PROJECTILES',
  UpdateDestroyedSegments: 'UPDATE_DESTROYED_SEGMENTS',
} as const;
export type ClientMessageType = typeof ClientMessageType[keyof typeof ClientMessageType];
export type ClientMessageAddTank = { type: typeof ClientMessageType.AddTank; payload: { tank: Tank } };
export type ClientMessageLeftGame = { type: typeof ClientMessageType.LeftGame; payload: { uid: string | null } };
export type ClientMessageUpdateTank = { type: typeof ClientMessageType.UpdateTank; payload: { tank: Tank } };
export type ClientMessageUpdateMines = { type: typeof ClientMessageType.UpdateMines; payload: { mines: Mine[] } };
export type ClientMessageUpdateProjectiles = {
  type: typeof ClientMessageType.UpdateProjectiles;
  payload: { projectiles: BattleProjectile[] };
};
export type ClientMessageUpdateDestroyedSegments = {
  type: typeof ClientMessageType.UpdateDestroyedSegments;
  payload: { destroyedSegmentIds: string[] };
};

export type ClientMessage =
  | ClientMessageAddTank
  | ClientMessageLeftGame
  | ClientMessageUpdateTank
  | ClientMessageUpdateMines
  | ClientMessageUpdateProjectiles
  | ClientMessageUpdateDestroyedSegments;

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
  projectiles: BattleProjectile[];
  destroyedSegmentIds: Set<string>;
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
