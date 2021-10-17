const webSocketsServerPort = 8001;
const WebSocket = require('ws');

const TANKS = [];


const decodeMessage = message => {
  return JSON.parse(
      decodeURIComponent(
          escape(message)
      )
  );
};
const encodeMessage = message => {
  return unescape(
      encodeURIComponent(
          JSON.stringify(message)
      )
  );
};

const sendMessageWS = (server, data) => {
  server.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(encodeMessage(data));
    }
  });
};

function addTank(tank) {
  TANKS.push(tank);
  sendMessageWS(wsServer, {type: 'TANKS_DATA', payload: {tanks: TANKS}});
}

function removeTank(uId) {
  const index = TANKS.findIndex(({uid}) => uid === uId);
  if (index > -1) {
    TANKS.splice(index, 1);
    sendMessageWS(wsServer, {type: 'TANKS_DATA', payload: {tanks: TANKS}});
  }
}

function updateTank(tank) {
  const index = TANKS.findIndex(({uid}) => uid === tank.uid);
  if (index > -1) {
    TANKS[index] = tank;
    sendMessageWS(wsServer, {type: 'TANKS_DATA', payload: {tanks: TANKS}});
  }
}

function updateMines(mines) {
  sendMessageWS(wsServer, {type: 'MINES_DATA', payload: {mines}});
}

const wsServer = new WebSocket.Server({
  port: webSocketsServerPort
});

wsServer.on('connection', ws => {
  try {
    const rndID = Math.random().toString(32);

    ws.send(encodeMessage({
      type: 'SET_ID',
      payload: {id: rndID}
    }));

    ws.on('message', data => {
      const messageJson = decodeMessage(data);

      switch (messageJson.type) {
        case 'ADD_TANK':
          addTank(messageJson.payload.tank);
          break;
        case 'LEFT_GAME':
          removeTank(messageJson.payload.uid);
          break;
        case 'UPDATE_TANK':
          updateTank(messageJson.payload.tank);
          break;
        case 'UPDATE_MINES':
          updateMines(messageJson.payload.mines);
          break;
      }
    });

    ws.on('close', () => {
    });
  } catch (e) {
    console.error(e);
  }
});
