export const PORT = Number(process.env.PORT || 8001);

export const GAME_BOUNDS = {
  width: 10000,
  height: 10000,
};

export const PLAYER_SPAWN = {
  x: 5000,
  y: 4350,
  angle: 90,
};

export const GAME_CONFIG = {
  gameBounds: GAME_BOUNDS,
  playerSpawn: PLAYER_SPAWN,
  webSocketPath: '/ws',
};
