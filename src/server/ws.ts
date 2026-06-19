import WebSocket, {WebSocketServer} from 'ws';
import type {Server} from 'http';
import {ClientMessageType, WsMessageType} from '../shared/types.ts';
import type {
  Battle,
  ClientMessage,
  Request,
  WebSocketClient,
  WsMessage,
} from '../shared/types.ts';
import {GAME_CONFIG} from './config.ts';
import {decodeMessage, encodeMessage} from './json.ts';
import {
  addTank,
  getBattle,
  markPlayerDisconnected,
  serializeBattle,
  tanksInBattle,
  updateDestroyedSegments,
  updateMines,
  updateTank,
  upsertPlayer,
} from './battles.ts';

export function createGameWebSocketServer(server: Server): WebSocketServer {
  const wsServer = new WebSocketServer({
    server,
    path: GAME_CONFIG.webSocketPath,
  });

  const sendBattleMessage = (battle: Battle, data: WsMessage): void => {
    wsServer.clients.forEach((client: WebSocketClient) => {
      if (client.readyState === WebSocket.OPEN && client.battleId === battle.id) {
        client.send(encodeMessage(data));
      }
    });
  };

  const broadcastBattleState = (battle: Battle): void => {
    sendBattleMessage(battle, {
      type: WsMessageType.BattleState,
      payload: {battle: serializeBattle(battle)},
    });
  };

  const broadcastTanks = (battle: Battle): void => {
    sendBattleMessage(battle, {type: WsMessageType.TanksData, payload: {tanks: tanksInBattle(battle)}});
  };

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
        let messageJson: ClientMessage;
        try {
          messageJson = decodeMessage<ClientMessage>(data);
        } catch (e) {
          console.error('Invalid WS message', e);
          return;
        }

        switch (messageJson.type) {
          case ClientMessageType.AddTank:
            addTank(ws, messageJson.payload.tank, sendBattleMessage, broadcastTanks, broadcastBattleState);
            break;
          case ClientMessageType.LeftGame:
            markPlayerDisconnected(ws, broadcastBattleState);
            break;
          case ClientMessageType.UpdateTank:
            updateTank(ws, messageJson.payload.tank, broadcastTanks, broadcastBattleState);
            break;
          case ClientMessageType.UpdateMines:
            updateMines(ws, messageJson.payload.mines, sendBattleMessage);
            break;
          case ClientMessageType.UpdateDestroyedSegments:
            updateDestroyedSegments(ws, messageJson.payload.destroyedSegmentIds, sendBattleMessage);
            break;
        }
      });

      ws.on('close', () => {
        markPlayerDisconnected(ws, broadcastBattleState);
      });
    } catch (e) {
      console.error(e);
      ws.close(1011, 'Server error');
    }
  });

  return wsServer;
}
