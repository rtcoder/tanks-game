export const PORT = Number(process.env.PORT || 8001);

export const GAME_BOUNDS = {
  width: 1500,
  height: 1500,
};

export const PLAYER_SPAWN = {
  x: 1375,
  y: 1375,
  angle: 270,
};

export const GAME_CONFIG = {
  gameBounds: GAME_BOUNDS,
  playerSpawn: PLAYER_SPAWN,
  webSocketPath: '/ws',
};
