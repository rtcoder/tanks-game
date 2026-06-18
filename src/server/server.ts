import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import path from 'path';
import {fileURLToPath} from 'url';
import WebSocket, {WebSocketServer} from 'ws';
import {
  ApiError,
  Battle,
  BattleMode,
  BattleStatus, ClientMessage, ClientMessageType,
  CreateBattlePayload,
  Mine,
  Player,
  PlayerPayload,
  Request,
  Response,
  SerializedBattle,
  Tank,
  WebSocketClient,
  WsMessage,
  WsMessageType,
} from '../shared/types.js';


const port = Number(process.env.PORT || 8001);
const dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(dirname, '..', '..', 'dist');
const battles = new Map<string, Battle>();
const GAME_BOUNDS = {
  width: 3000,
  height: 2200,
};
const PLAYER_SPAWN = {
  x: 700,
  y: 700,
  angle: 0,
};
const GAME_CONFIG = {
  gameBounds: GAME_BOUNDS,
  playerSpawn: PLAYER_SPAWN,
  webSocketPath: '/ws',
};

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
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
  if (req.url === undefined) {
    sendNotFound(res);
    return;
  }
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
      hint: 'Run npm run build before npm start.',
    });
    return;
  }

  const ext = path.extname(targetPath);
  res.writeHead(200, {'Content-Type': contentTypes[ext] || 'application/octet-stream'});
  const stream = fs.createReadStream(targetPath);
  stream.on('data', (chunk: unknown) => {
    res.write(chunk);
  });
  stream.on('end', () => {
    res.end();
  });
  stream.on('error', () => {
    sendJson(res, 500, {error: 'Could not read static file'});
  });
}

function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk: unknown) => {
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

function sanitizeColor(color: string): string {
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
      y: clamp(tank?.velocity?.y, -600, 600),
    },
    friction: clamp(tank?.friction, 0.75, 0.99),
    force: clamp(tank?.force, 20, 160),
  };
}

function sanitizeMine(mine: any): Mine {
  return {
    x: clamp(mine?.x, 0, GAME_BOUNDS.width),
    y: clamp(mine?.y, 0, GAME_BOUNDS.height),
    size: clamp(mine?.size, 8, 40),
    time: clamp(mine?.time, 0, Date.now()),
    ownerUid: typeof mine?.ownerUid === 'string' ? mine.ownerUid : null,
  };
}

function createBattle({title, maxPlayers, nick, playerId}: CreateBattlePayload): { battle: Battle; player: Player } {
  const id = crypto.randomUUID();
  const battle: Battle = {
    id,
    title: sanitizeText(title, 'Untitled battle', 40),
    mode: BattleMode.Ffa,
    status: BattleStatus.Waiting,
    maxPlayers: clamp(maxPlayers, 2, 16),
    createdAt: new Date().toISOString(),
    winnerUid: null,
    players: new Map(),
    mines: [],
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
      tank: null,
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
    alive: Boolean(player.tank && player.tank.lives > 0),
  }));

  return {
    id: battle.id,
    title: battle.title,
    mode: battle.mode,
    status: battle.status,
    maxPlayers: battle.maxPlayers,
    createdAt: battle.createdAt,
    winnerUid: battle.winnerUid,
    players,
  };
}

function tanksInBattle(battle: Battle): Tank[] {
  return Array.from(battle.players.values())
      .map(player => player.tank)
      .filter((tank): tank is Tank => Boolean(tank));
}

function sendBattleMessage(battle: Battle, data: WsMessage): void {
  wsServer.clients.forEach((client: WebSocketClient) => {
    if (client.readyState === WebSocket.OPEN && client.battleId === battle.id) {
      client.send(encodeMessage(data));
    }
  });
}

function broadcastBattleState(battle: Battle): void {
  sendBattleMessage(battle, {
    type: WsMessageType.BattleState,
    payload: {battle: serializeBattle(battle)},
  });
}

function broadcastTanks(battle: Battle): void {
  sendBattleMessage(battle, {type: WsMessageType.TanksData, payload: {tanks: tanksInBattle(battle)}});
}

function maybeFinishBattle(battle: Battle): void {
  const tanks = tanksInBattle(battle);
  const aliveTanks = tanks.filter(tank => tank.lives > 0);

  if (battle.status === BattleStatus.Waiting && tanks.length > 1) {
    battle.status = BattleStatus.Active;
    broadcastBattleState(battle);
  }

  if (battle.status !== BattleStatus.Active || tanks.length < 2 || aliveTanks.length !== 1) {
    return;
  }

  battle.status = BattleStatus.Finished;
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
  sendBattleMessage(battle, {type: WsMessageType.MinesData, payload: {mines: battle.mines}});
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
  sendBattleMessage(battle, {type: WsMessageType.MinesData, payload: {mines: battle.mines}});
}

async function handleApiRequest(req: Request, res: Response): Promise<boolean> {
  if (req.url === undefined) {
    sendNotFound(res);
    return true;
  }
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
  if (req.url === undefined) {
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

const wsServer = new WebSocketServer({
  server: httpServer,
  path: GAME_CONFIG.webSocketPath,
});

wsServer.on('connection', (ws: WebSocketClient, req: Request) => {
  if (req.url === undefined) {
    return;
  }

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
      type: WsMessageType.SetId,
      payload: {
        id: player.id,
        battle: serializeBattle(battle),
      },
    }));
    broadcastBattleState(battle);

    ws.on('message', (data: unknown) => {
      let messageJson:ClientMessage;
      try {
        messageJson = decodeMessage(data);
      } catch (e) {
        console.error('Invalid WS message', e);
        return;
      }

      switch (messageJson.type) {
        case ClientMessageType.AddTank:
          addTank(ws, messageJson.payload.tank);
          break;
        case ClientMessageType.LeftGame:
          markPlayerDisconnected(ws);
          break;
        case ClientMessageType.UpdateTank:
          updateTank(ws, messageJson.payload.tank);
          break;
        case ClientMessageType.UpdateMines:
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
