const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');

const port = Number(process.env.PORT || 8001);
const distDir = path.resolve(__dirname, '..', 'dist');
const battles = new Map();
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

const decodeMessage = message => JSON.parse(message);
const encodeMessage = message => JSON.stringify(message);

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {'Content-Type': 'application/json; charset=utf-8'});
  res.end(encodeMessage(data));
}

function sendNotFound(res) {
  sendJson(res, 404, {error: 'Not found'});
}

function serveStatic(req, res) {
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

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
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

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return min;
  }
  return Math.min(Math.max(number, min), max);
}

function sanitizeText(value, fallback, maxLength) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    return fallback;
  }
  return text.slice(0, maxLength);
}

function sanitizeColor(color) {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '#4f8cff';
}

function sanitizePlayerId(playerId) {
  return typeof playerId === 'string' && playerId.length >= 8 && playerId.length <= 80
    ? playerId
    : crypto.randomUUID();
}

function sanitizeTank(tank, uid) {
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

function sanitizeMine(mine) {
  return {
    x: clamp(mine?.x, 0, GAME_BOUNDS.width),
    y: clamp(mine?.y, 0, GAME_BOUNDS.height),
    size: clamp(mine?.size, 8, 40),
    time: clamp(mine?.time, 0, Date.now()),
    ownerUid: typeof mine?.ownerUid === 'string' ? mine.ownerUid : null
  };
}

function createBattle({title, maxPlayers, nick, playerId}) {
  const id = crypto.randomUUID();
  const battle = {
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

function getBattle(id) {
  if (typeof id !== 'string') {
    return null;
  }
  return battles.get(id.trim()) || null;
}

function upsertPlayer(battle, {nick, playerId}) {
  const id = sanitizePlayerId(playerId);
  let player = battle.players.get(id);

  if (!player && battle.players.size >= battle.maxPlayers) {
    const error = new Error('Battle is full');
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

function serializeBattle(battle) {
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

function tanksInBattle(battle) {
  return Array.from(battle.players.values())
    .map(player => player.tank)
    .filter(Boolean);
}

function sendBattleMessage(battle, data) {
  wsServer.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.battleId === battle.id) {
      client.send(encodeMessage(data));
    }
  });
}

function broadcastBattleState(battle) {
  sendBattleMessage(battle, {
    type: 'BATTLE_STATE',
    payload: {battle: serializeBattle(battle)}
  });
}

function broadcastTanks(battle) {
  sendBattleMessage(battle, {type: 'TANKS_DATA', payload: {tanks: tanksInBattle(battle)}});
}

function maybeFinishBattle(battle) {
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

function addTank(ws, tank) {
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

function markPlayerDisconnected(ws) {
  if (!ws.player || !ws.battle) {
    return;
  }
  ws.player.connected = false;
  ws.player.lastSeen = new Date().toISOString();
  broadcastBattleState(ws.battle);
}

function updateTank(ws, tank) {
  const player = ws.player;
  const battle = ws.battle;

  if (!player || !battle || !player.tank) {
    return;
  }

  player.tank = sanitizeTank(tank, player.id);
  broadcastTanks(battle);
  maybeFinishBattle(battle);
}

function updateMines(ws, mines) {
  const battle = ws.battle;
  if (!battle || !Array.isArray(mines)) {
    return;
  }
  battle.mines = mines.slice(-80).map(sanitizeMine);
  sendBattleMessage(battle, {type: 'MINES_DATA', payload: {mines: battle.mines}});
}

async function handleApiRequest(req, res) {
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

const httpServer = http.createServer((req, res) => {
  if (!req.url) {
    sendNotFound(res);
    return;
  }

  if (req.url.startsWith('/api/')) {
    handleApiRequest(req, res)
      .then(handled => {
        if (!handled) {
          sendNotFound(res);
        }
      })
      .catch(error => {
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

wsServer.on('connection', (ws, req) => {
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
