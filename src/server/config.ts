export const PORT = Number(process.env.PORT || 8001);

export const GAME_BOUNDS = {
  width: 3000,
  height: 2200,
};

export const PLAYER_SPAWN = {
  x: 700,
  y: 700,
  angle: 0,
};

export const GAME_CONFIG = {
  gameBounds: GAME_BOUNDS,
  playerSpawn: PLAYER_SPAWN,
  webSocketPath: '/ws',
};
