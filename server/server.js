require('dotenv').config();
const express = require('express');
const app = express();
const cors = require('cors');
const webSocketsServerPort = 8001;
const webSocketServer = require('websocket').server;
const http = require('http');
const {onRequest} = require("./ws/wsMethods");


app.use(cors());
app.use(express.json({limit: '100mb'}));

// Websocket server
const server = http.createServer(app);
server.listen(webSocketsServerPort);
const wsServer = new webSocketServer({
  httpServer: server
});
wsServer.on('request', onRequest);

app.listen(8000, () =>
  console.info("Server started and is listening on port 8000"));
