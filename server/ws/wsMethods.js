const clients = {};

const decodeMessage = message => {
  return JSON.parse(
    decodeURIComponent(
      escape(
        Buffer.from(message, 'base64').toString()
      )
    )
  );
};
const encodeMessage = message => {
  return Buffer.from(
    unescape(
      encodeURIComponent(
        JSON.stringify(message)
      )
    )
  ).toString('base64');
};

const sendMessageWS = json => {
  Object.keys(clients).map((client) => {
    clients[client].sendUTF(
      encodeMessage(json)
    );
  });
};

const onMessage = id => async message => {
  if (message.type === 'utf8') {
    const dataFromClient = decodeMessage(message.utf8Data);

    sendMessageWS(dataFromClient);
  }
};

const onClose = id => connection => {
  console.info((new Date()) + " Peer " + id + " disconnected.");
  delete clients[id];
};

const onRequest = request => {
  try {
    const query = {...request.resourceURL.query};
    const token = query.t;
    if (!token) {
      return;
    }
    const rndID = Math.random().toString(32);

    console.info((new Date()) + ' Recieved a new connection from origin ' + request.origin + '.');
    const connection = request.accept(null, request.origin);
    connection.sendUTF(encodeMessage({id: rndID}));

    clients[rndID] = connection;

    console.info('connected: ' + rndID);

    connection.on('message', onMessage(rndID));
    connection.on('close', onClose(rndID));
  } catch (e) {
    console.error(e);
  }
};

module.exports = {
  onRequest,
  sendMessageWS,
  decodeMessage
};
