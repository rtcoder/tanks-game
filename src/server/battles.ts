import crypto from 'crypto';
import {BattleMode, BattleStatus, WsMessageType} from '../shared/types.ts';
import type {
  ApiError,
  Battle,
  CreateBattlePayload,
  Player,
  PlayerPayload,
  SerializedBattle,
  Tank,
  WebSocketClient,
  WsMessage,
} from '../shared/types.ts';
import {
  clamp,
  sanitizeDestroyedSegmentIds,
  sanitizeMine,
  sanitizePlayerId,
  sanitizeTank,
  sanitizeText,
} from './sanitize.ts';

const battles = new Map<string, Battle>();

export function createBattle({title, maxPlayers, nick, playerId}: CreateBattlePayload): { battle: Battle; player: Player } {
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
    destroyedSegmentIds: new Set(),
  };
  battles.set(id, battle);
  const player = upsertPlayer(battle, {nick, playerId});
  return {battle, player};
}

export function getBattle(id: unknown): Battle | null {
  if (typeof id !== 'string') {
    return null;
  }
  return battles.get(id.trim()) || null;
}

export function upsertPlayer(battle: Battle, {nick, playerId}: PlayerPayload): Player {
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

export function serializeBattle(battle: Battle): SerializedBattle {
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

export function tanksInBattle(battle: Battle): Tank[] {
  return Array.from(battle.players.values())
    .map(player => player.tank)
    .filter((tank): tank is Tank => Boolean(tank));
}

export function maybeFinishBattle(battle: Battle, broadcastBattleState: (battle: Battle) => void): void {
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

export function addTank(
  ws: WebSocketClient,
  tank: unknown,
  sendBattleMessage: (battle: Battle, data: WsMessage) => void,
  broadcastTanks: (battle: Battle) => void,
  broadcastBattleState: (battle: Battle) => void,
): void {
  const player = ws.player;
  const battle = ws.battle;

  if (!player || !battle) {
    return;
  }

  player.tank = sanitizeTank(tank, player.id);
  broadcastTanks(battle);
  sendBattleMessage(battle, {type: WsMessageType.MinesData, payload: {mines: battle.mines}});
  sendBattleMessage(battle, {
    type: WsMessageType.DestructiblesData,
    payload: {destroyedSegmentIds: Array.from(battle.destroyedSegmentIds)},
  });
  maybeFinishBattle(battle, broadcastBattleState);
}

export function markPlayerDisconnected(ws: WebSocketClient, broadcastBattleState: (battle: Battle) => void): void {
  if (!ws.player || !ws.battle) {
    return;
  }
  ws.player.connected = false;
  ws.player.lastSeen = new Date().toISOString();
  broadcastBattleState(ws.battle);
}

export function updateTank(
  ws: WebSocketClient,
  tank: unknown,
  broadcastTanks: (battle: Battle) => void,
  broadcastBattleState: (battle: Battle) => void,
): void {
  const player = ws.player;
  const battle = ws.battle;

  if (!player || !battle || !player.tank) {
    return;
  }

  player.tank = sanitizeTank(tank, player.id);
  broadcastTanks(battle);
  maybeFinishBattle(battle, broadcastBattleState);
}

export function updateMines(
  ws: WebSocketClient,
  mines: unknown,
  sendBattleMessage: (battle: Battle, data: WsMessage) => void,
): void {
  const battle = ws.battle;
  if (!battle || !Array.isArray(mines)) {
    return;
  }
  battle.mines = mines.slice(-80).map(sanitizeMine);
  sendBattleMessage(battle, {type: WsMessageType.MinesData, payload: {mines: battle.mines}});
}

export function updateDestroyedSegments(
  ws: WebSocketClient,
  destroyedSegmentIds: unknown,
  sendBattleMessage: (battle: Battle, data: WsMessage) => void,
): void {
  const battle = ws.battle;
  if (!battle) {
    return;
  }

  sanitizeDestroyedSegmentIds(destroyedSegmentIds)
    .forEach((segmentId) => battle.destroyedSegmentIds.add(segmentId));
  sendBattleMessage(battle, {
    type: WsMessageType.DestructiblesData,
    payload: {destroyedSegmentIds: Array.from(battle.destroyedSegmentIds)},
  });
}
