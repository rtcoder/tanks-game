const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');

type Request = {
  url?: string;
  method?: string;
  headers: {
    host?: string;
  };
  on: (event: string, listener: (chunk?: Buffer | Error) => void) => void;
  destroy: () => void;
};

type Response = {
  writeHead: (statusCode: number, headers: Record<string, string>) => void;
  end: (data?: string) => void;
};

type WebSocketClient = {
  readyState: number;
  battleId?: string;
  battle?: Battle;
  player?: Player;
  uid?: string;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  on: (event: string, listener: (data?: unknown) => void) => void;
};

type BattleMode = 'ffa' | 'teams';
type BattleStatus = 'waiting' | 'active' | 'finished';

type Point = {
  x: number;
  y: number;
};

type Trace = {
  x: number;
  y: number;
  angle: number;
  time: number;
};

type Tank = {
  uid: string;
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
};

type Mine = {
  x: number;
  y: number;
  size: number;
  time: number;
  ownerUid: string | null;
};

type Player = {
  id: string;
  nick: string;
  connected: boolean;
  lastSeen: string | null;
  tank: Tank | null;
};

type Battle = {
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

type PlayerPayload = {
  nick?: unknown;
  playerId?: unknown;
};

type CreateBattlePayload = PlayerPayload & {
  title?: unknown;
  maxPlayers?: unknown;
};

type ApiError = Error & {
  statusCode?: number;
};

type SerializedBattle = {
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

const port = Number(process.env.PORT || 8001);
const distDir = path.resolve(__dirname, '..', 'dist');
const battles = new Map<string, Battle>();
const GAME_BOUNDS = {
  width: 3000,
  height: 2200
};
const PLAYER_SPAWN = {
  x: 700,
  y: 700,
  angle: 0
};
const GAME_CONFIG = {
  gameBounds: GAME_BOUNDS,
  playerSpawn: PLAYER_SPAWN,
  webSocketPath: '/ws'
};

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

const decodeMessage = (message: unknown): any => JSON.parse(String(message));
const encodeMessage = (message: unknown): string => JSON.stringify(message);

function sendJson(res: Response, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, {'Content-Type': 'application/json; charset=utf-8'});
  res.end(encodeMessage(data));
}

function sendNotFound(res: Response): void {
  sendJson(res, 404, {error: 'Not found'});
}

function serveStatic(req: Request, res: Response): void {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(requestUrl.pathname);
  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = path.resolve(distDir, relativePath);

  if (!filePath.startsWith(distDir)) {
    sendNotFound(res);
    return;
  }

  const fallbackPath = path.join(distDir, 'index.html');
  const targetPath = fs.existsSync(filePath) && fs.statSync(filePath).isFile() ? filePath : fallbackPath;
  if (!fs.existsSync(targetPath)) {
    sendJson(res, 503, {
      error: 'Frontend build not found',
      hint: 'Run npm run build before npm start.'
    });
    return;
  }

  const ext = path.extname(targetPath);
  res.writeHead(200, {'Content-Type': contentTypes[ext] || 'application/octet-stream'});
  fs.createReadStream(targetPath).pipe(res);
}

function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', chunk => {
      body += String(chunk);
      if (body.length > 64 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function clamp(value: unknown, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return min;
  }
  return Math.min(Math.max(number, min), max);
}

function sanitizeText(value: unknown, fallback: string, maxLength: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    return fallback;
  }
  return text.slice(0, maxLength);
}

function sanitizeColor(color: unknown): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '#4f8cff';
}

function sanitizePlayerId(playerId: unknown): string {
  return typeof playerId === 'string' && playerId.length >= 8 && playerId.length <= 80
    ? playerId
    : crypto.randomUUID();
}

function sanitizeTank(tank: any, uid: string): Tank {
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
      y: clamp(tank?.velocity?.y, -600, 600)
    },
    friction: clamp(tank?.friction, 0.75, 0.99),
    force: clamp(tank?.force, 20, 160)
  };
}

function sanitizeMine(mine: any): Mine {
  return {
    x: clamp(mine?.x, 0, GAME_BOUNDS.width),
    y: clamp(mine?.y, 0, GAME_BOUNDS.height),
    size: clamp(mine?.size, 8, 40),
    time: clamp(mine?.time, 0, Date.now()),
    ownerUid: typeof mine?.ownerUid === 'string' ? mine.ownerUid : null
  };
}

function createBattle({title, maxPlayers, nick, playerId}: CreateBattlePayload): { battle: Battle; player: Player } {
  const id = crypto.randomUUID();
  const battle: Battle = {
    id,
    title: sanitizeText(title, 'Untitled battle', 40),
    mode: 'ffa',
    status: 'waiting',
    maxPlayers: clamp(maxPlayers, 2, 16),
    createdAt: new Date().toISOString(),
    winnerUid: null,
    players: new Map(),
    mines: []
  };
  battles.set(id, battle);
  const player = upsertPlayer(battle, {nick, playerId});
  return {battle, player};
}

function getBattle(id: unknown): Battle | null {
  if (typeof id !== 'string') {
    return null;
  }
  return battles.get(id.trim()) || null;
}

function upsertPlayer(battle: Battle, {nick, playerId}: PlayerPayload): Player {
  const id = sanitizePlayerId(playerId);
  let player = battle.players.get(id);

  if (!player && battle.players.size >= battle.maxPlayers) {
    const error = new Error('Battle is full') as ApiError;
    error.statusCode = 409;
    throw error;
  }

  if (!player) {
    player = {
      id,
      nick: sanitizeText(nick, 'Player', 24),
      connected: false,
      lastSeen: null,
      tank: null
    };
    battle.players.set(id, player);
  } else {
    player.nick = sanitizeText(nick, player.nick, 24);
  }

  return player;
}

function serializeBattle(battle: Battle): SerializedBattle {
  const players = Array.from(battle.players.values()).map(player => ({
    id: player.id,
    nick: player.nick,
    connected: player.connected,
    alive: Boolean(player.tank && player.tank.lives > 0)
  }));

  return {
    id: battle.id,
    title: battle.title,
    mode: battle.mode,
    status: battle.status,
    maxPlayers: battle.maxPlayers,
    createdAt: battle.createdAt,
    winnerUid: battle.winnerUid,
    players
  };
}

function tanksInBattle(battle: Battle): Tank[] {
  return Array.from(battle.players.values())
    .map(player => player.tank)
    .filter((tank): tank is Tank => Boolean(tank));
}

function sendBattleMessage(battle: Battle, data: unknown): void {
  wsServer.clients.forEach((client: WebSocketClient) => {
    if (client.readyState === WebSocket.OPEN && client.battleId === battle.id) {
      client.send(encodeMessage(data));
    }
  });
}

function broadcastBattleState(battle: Battle): void {
  sendBattleMessage(battle, {
    type: 'BATTLE_STATE',
    payload: {battle: serializeBattle(battle)}
  });
}

function broadcastTanks(battle: Battle): void {
  sendBattleMessage(battle, {type: 'TANKS_DATA', payload: {tanks: tanksInBattle(battle)}});
}

function maybeFinishBattle(battle: Battle): void {
  const tanks = tanksInBattle(battle);
  const aliveTanks = tanks.filter(tank => tank.lives > 0);

  if (battle.status === 'waiting' && tanks.length > 1) {
    battle.status = 'active';
    broadcastBattleState(battle);
  }

  if (battle.status !== 'active' || tanks.length < 2 || aliveTanks.length !== 1) {
    return;
  }

  battle.status = 'finished';
  battle.winnerUid = aliveTanks[0].uid;
  broadcastBattleState(battle);
}

function addTank(ws: WebSocketClient, tank: unknown): void {
  const player = ws.player;
  const battle = ws.battle;

  if (!player || !battle) {
    return;
  }

  player.tank = player.tank
    ? sanitizeTank(player.tank, player.id)
    : sanitizeTank(tank, player.id);
  broadcastTanks(battle);
  sendBattleMessage(battle, {type: 'MINES_DATA', payload: {mines: battle.mines}});
  maybeFinishBattle(battle);
}

function markPlayerDisconnected(ws: WebSocketClient): void {
  if (!ws.player || !ws.battle) {
    return;
  }
  ws.player.connected = false;
  ws.player.lastSeen = new Date().toISOString();
  broadcastBattleState(ws.battle);
}

function updateTank(ws: WebSocketClient, tank: unknown): void {
  const player = ws.player;
  const battle = ws.battle;

  if (!player || !battle || !player.tank) {
    return;
  }

  player.tank = sanitizeTank(tank, player.id);
  broadcastTanks(battle);
  maybeFinishBattle(battle);
}

function updateMines(ws: WebSocketClient, mines: unknown): void {
  const battle = ws.battle;
  if (!battle || !Array.isArray(mines)) {
    return;
  }
  battle.mines = mines.slice(-80).map(sanitizeMine);
  sendBattleMessage(battle, {type: 'MINES_DATA', payload: {mines: battle.mines}});
}

async function handleApiRequest(req: Request, res: Response): Promise<boolean> {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (requestUrl.pathname === '/api/game-config') {
    sendJson(res, 200, GAME_CONFIG);
    return true;
  }

  if (requestUrl.pathname === '/api/health') {
    sendJson(res, 200, {ok: true});
    return true;
  }

  if (requestUrl.pathname === '/api/battles' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const {battle, player} = createBattle(body);
    sendJson(res, 201, {battle: serializeBattle(battle), playerId: player.id});
    return true;
  }

  const joinMatch = requestUrl.pathname.match(/^\/api\/battles\/([^/]+)\/join$/);
  if (joinMatch && req.method === 'POST') {
    const battle = getBattle(joinMatch[1]);
    if (!battle) {
      sendJson(res, 404, {error: 'Battle not found'});
      return true;
    }
    const body = await readJsonBody(req);
    const player = upsertPlayer(battle, body);
    sendJson(res, 200, {battle: serializeBattle(battle), playerId: player.id});
    return true;
  }

  const battleMatch = requestUrl.pathname.match(/^\/api\/battles\/([^/]+)$/);
  if (battleMatch && req.method === 'GET') {
    const battle = getBattle(battleMatch[1]);
    if (!battle) {
      sendJson(res, 404, {error: 'Battle not found'});
      return true;
    }
    sendJson(res, 200, {battle: serializeBattle(battle)});
    return true;
  }

  return false;
}

const httpServer = http.createServer((req: Request, res: Response) => {
  if (!req.url) {
    sendNotFound(res);
    return;
  }

  if (req.url.startsWith('/api/')) {
    handleApiRequest(req, res)
      .then((handled: boolean) => {
        if (!handled) {
          sendNotFound(res);
        }
      })
      .catch((error: ApiError) => {
        sendJson(res, error.statusCode || 400, {error: error.message || 'Bad request'});
      });
    return;
  }

  serveStatic(req, res);
});

const wsServer = new WebSocket.Server({
  server: httpServer,
  path: GAME_CONFIG.webSocketPath
});

wsServer.on('connection', (ws: WebSocketClient, req: Request) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const battle = getBattle(requestUrl.searchParams.get('battleId'));
    const playerId = requestUrl.searchParams.get('playerId');
    const nick = requestUrl.searchParams.get('nick');

    if (!battle || !playerId) {
      ws.close(1008, 'Missing battle session');
      return;
    }

    const player = upsertPlayer(battle, {playerId, nick});
    player.connected = true;
    player.lastSeen = null;
    ws.battleId = battle.id;
    ws.battle = battle;
    ws.player = player;
    ws.uid = player.id;

    ws.send(encodeMessage({
      type: 'SET_ID',
      payload: {
        id: player.id,
        battle: serializeBattle(battle)
      }
    }));
    broadcastBattleState(battle);

    ws.on('message', data => {
      let messageJson;
      try {
        messageJson = decodeMessage(data);
      } catch (e) {
        console.error('Invalid WS message', e);
        return;
      }

      switch (messageJson.type) {
        case 'ADD_TANK':
          addTank(ws, messageJson.payload.tank);
          break;
        case 'LEFT_GAME':
          markPlayerDisconnected(ws);
          break;
        case 'UPDATE_TANK':
          updateTank(ws, messageJson.payload.tank);
          break;
        case 'UPDATE_MINES':
          updateMines(ws, messageJson.payload.mines);
          break;
      }
    });

    ws.on('close', () => {
      markPlayerDisconnected(ws);
    });
  } catch (e) {
    console.error(e);
    ws.close(1011, 'Server error');
  }
});

httpServer.listen(port, () => {
  console.info(`Tanks server listening on http://localhost:${port}`);
});
