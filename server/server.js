const webSocketsServerPort = 8001;
const WebSocket = require('ws');

const TANKS = [];
let MINES = [];
const GAME_BOUNDS = {
  width: 3000,
  height: 2200
};

const decodeMessage = message => {
  return JSON.parse(message);
};
const encodeMessage = message => {
  return JSON.stringify(message);
};

const sendMessageWS = (server, data) => {
  server.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(encodeMessage(data));
    }
  });
};

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return min;
  }
  return Math.min(Math.max(number, min), max);
}

function sanitizeColor(color) {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '#4f8cff';
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

function addTank(ws, tank) {
  const sanitizedTank = sanitizeTank(tank, ws.uid);
  const index = TANKS.findIndex(({uid}) => uid === ws.uid);
  if (index > -1) {
    TANKS[index] = sanitizedTank;
  } else {
    TANKS.push(sanitizedTank);
  }
  sendMessageWS(wsServer, {type: 'TANKS_DATA', payload: {tanks: TANKS}});
}

function removeTank(uId) {
  const index = TANKS.findIndex(({uid}) => uid === uId);
  if (index > -1) {
    TANKS.splice(index, 1);
    sendMessageWS(wsServer, {type: 'TANKS_DATA', payload: {tanks: TANKS}});
  }
}

function updateTank(ws, tank) {
  const index = TANKS.findIndex(({uid}) => uid === ws.uid);
  if (index > -1) {
    TANKS[index] = sanitizeTank(tank, ws.uid);
    sendMessageWS(wsServer, {type: 'TANKS_DATA', payload: {tanks: TANKS}});
  }
}

function updateMines(mines) {
  if (!Array.isArray(mines)) {
    return;
  }
  MINES = mines.slice(-80).map(sanitizeMine);
  sendMessageWS(wsServer, {type: 'MINES_DATA', payload: {mines: MINES}});
}

const wsServer = new WebSocket.Server({
  port: webSocketsServerPort
});

wsServer.on('connection', ws => {
  try {
    ws.uid = Math.random().toString(32).slice(2);

    ws.send(encodeMessage({
      type: 'SET_ID',
      payload: {id: ws.uid}
    }));

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
          removeTank(ws.uid);
          break;
        case 'UPDATE_TANK':
          updateTank(ws, messageJson.payload.tank);
          break;
        case 'UPDATE_MINES':
          updateMines(messageJson.payload.mines);
          break;
      }
    });

    ws.on('close', () => {
      removeTank(ws.uid);
    });
  } catch (e) {
    console.error(e);
  }
});
