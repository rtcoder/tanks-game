import type { BattleSummary } from '../../shared/types';

type BattleSessionResponse = {
  battle: BattleSummary;
  playerId: string;
};

type CreateBattlePayload = {
  title: string;
  maxPlayers: number;
  nick: string;
  playerId: string;
};

type JoinBattlePayload = {
  battleId: string;
  nick: string;
  playerId: string;
};

const requestJson = async <T>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  const data = await response.json() as T;

  if (!response.ok) {
    const errorData = data as { error?: string };
    throw new Error(errorData.error || 'Request failed');
  }

  return data;
};

export const formatBattleStatus = (battle: BattleSummary): string => {
  const playerCount = battle.players.length;
  const winner = battle.winnerUid
    ? battle.players.find((player) => player.id === battle.winnerUid)?.nick ?? 'unknown'
    : null;

  if (battle.status === 'finished' && winner) {
    return `${battle.title} · winner: ${winner}`;
  }

  return `${battle.title} · ${playerCount}/${battle.maxPlayers} · ${battle.mode.toUpperCase()} · ${battle.status}`;
};

export const createBattle = async ({
  title,
  maxPlayers,
  nick,
  playerId,
}: CreateBattlePayload): Promise<BattleSessionResponse> => requestJson<BattleSessionResponse>('/api/battles', {
  method: 'POST',
  body: JSON.stringify({
    title,
    maxPlayers,
    nick,
    playerId,
  }),
});

export const joinBattle = async ({
  battleId,
  nick,
  playerId,
}: JoinBattlePayload): Promise<BattleSessionResponse> => requestJson<BattleSessionResponse>(`/api/battles/${encodeURIComponent(battleId)}/join`, {
  method: 'POST',
  body: JSON.stringify({
    nick,
    playerId,
  }),
});
