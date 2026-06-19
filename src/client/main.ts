import './style.css';
import {BattleStatus, ClientMessageType, WsMessageType} from '../shared/types';
import type {
  BattleSummary,
  ClientMessage,
  GameConfig,
  KeysState,
  Mine,
  Tank,
  WsMessage,
} from '../shared/types';
import {circleRectColliding, isMineArmed, isPointInWater} from './game/collisions';
import {
  MINE_ARM_MS,
  MINE_COOLDOWN_MS,
  MINIMAP_WIDTH,
  STORAGE_KEYS,
  VIEWPORT_HEIGHT,
  VIEWPORT_WIDTH,
} from './game/constants';
import {clearKeys, switchKey} from './game/input';
import {createWalls, createWaterFields} from './game/map';
import {getRectangleCornerPointsAfterRotate, radiansToDegrees, round} from './game/math';
import {getRandomColor, lighterColor} from './game/rendering';
import {createThreeBattleScene} from './game/threeScene';
import {createBattle, formatBattleStatus, joinBattle} from './network/battles';
import {contexts, dom} from './ui/dom';

let maxGameWidth = 3000;
let maxGameHeight = 2200;
let minimapHeight = MINIMAP_WIDTH * (maxGameHeight / maxGameWidth);
let playerSpawn = {
  x: 700,
  y: 700,
  angle: 0,
};
let webSocketPath = '/ws';

const keys: KeysState = {
  w: false,
  s: false,
  a: false,
  d: false,
  shift: false,
  space: false,
};

const userTank: Tank = {
  uid: null,
  lives: 100,
  x: playerSpawn.x,
  y: playerSpawn.y,
  speed: 7,
  angle: playerSpawn.angle,
  mod: 0,
  tracksShift: [0, 0],
  traces: [],
  width: 50,
  height: 40,
  color: '#000000',
  velocity: {
    x: 0,
    y: 0,
  },
  friction: 0.9,
  force: 100,
};

const remoteTanks: Tank[] = [];
const mines: Mine[] = [];

let lastMineTime = 0;
let isTankOnWater = false;
let isGameStarted = false;
let isGameOver = false;
let lastFrameTime = 0;
let webSocket: WebSocket | null = null;
let currentBattle: BattleSummary | null = null;
let currentPlayerId = localStorage.getItem(STORAGE_KEYS.playerId) || crypto.randomUUID();
let threeScene: ReturnType<typeof createThreeBattleScene> | null = null;

const {
  joyStick,
  joyStickDot,
  wrapper,
  menuBoard,
  controlsPanel,
  createBattleButton,
  joinBattleButton,
  controlsButton,
  respawnButton,
  gameOverPanel,
  hpFill,
  hpValue,
  mineStatus,
  playersCount,
  nickInput,
  battleTitleInput,
  maxPlayersInput,
  battleIdInput,
  battleStatusText,
  touchMineButton,
  minimapContainer,
  canvas,
  canvasMinimap,
  canvasWalls,
  canvasWallsMinimap,
} = dom;

const {
  ctxMinimap,
  ctxWalls,
  ctxWallsMinimap,
} = contexts;

const walls = createWalls(maxGameWidth, maxGameHeight);
const waterFields = createWaterFields();

const syncBoundaryWalls = (): void => {
  Object.assign(walls[0], { x: 0, y: 0, width: maxGameWidth, height: 20 });
  Object.assign(walls[1], { x: 0, y: maxGameHeight - 20, width: maxGameWidth, height: 20 });
  Object.assign(walls[2], { x: maxGameWidth - 20, y: 0, width: 20, height: maxGameHeight });
  Object.assign(walls[3], { x: 0, y: 0, width: 20, height: maxGameHeight });
};

const loadGameConfig = async (): Promise<void> => {
  try {
    const response = await fetch('/api/game-config');
    if (!response.ok) {
      return;
    }
    const config = await response.json() as GameConfig;
    maxGameWidth = config.gameBounds.width;
    maxGameHeight = config.gameBounds.height;
    minimapHeight = MINIMAP_WIDTH * (maxGameHeight / maxGameWidth);
    playerSpawn = config.playerSpawn;
    webSocketPath = config.webSocketPath;
    syncBoundaryWalls();
    threeScene?.rebuildStatic();
  } catch {
    // Dev mode can still run the canvas without backend config.
  }
};

const sanitizeNick = (): string => nickInput.value.trim().slice(0, 24) || 'Player';

const setBattleStatus = (message: string): void => {
  battleStatusText.textContent = message;
};

const persistSession = (battle: BattleSummary, playerId: string): void => {
  currentBattle = battle;
  currentPlayerId = playerId;
  localStorage.setItem(STORAGE_KEYS.nick, sanitizeNick());
  localStorage.setItem(STORAGE_KEYS.playerId, playerId);
  localStorage.setItem(STORAGE_KEYS.battleId, battle.id);
  battleIdInput.value = battle.id;
};

const createBattleSession = async (): Promise<void> => {
  const nick = sanitizeNick();
  const maxPlayers = Number(maxPlayersInput.value);
  const response = await createBattle({
    title: battleTitleInput.value.trim(),
    maxPlayers,
    nick,
    playerId: currentPlayerId,
  });
  persistSession(response.battle, response.playerId);
  setBattleStatus(formatBattleStatus(response.battle));
  await newGame();
};

const joinBattleSession = async (battleId = battleIdInput.value): Promise<void> => {
  const trimmedBattleId = battleId.trim();
  if (!trimmedBattleId) {
    setBattleStatus('Paste a battle UUID first');
    return;
  }

  const response = await joinBattle({
    battleId: trimmedBattleId,
    nick: sanitizeNick(),
    playerId: currentPlayerId,
  });
  persistSession(response.battle, response.playerId);
  setBattleStatus(formatBattleStatus(response.battle));
  await newGame();
};

const resize = (): void => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const padding = width < 700 ? 16 : 32;
  const xScale = (width - padding) / VIEWPORT_WIDTH;
  const yScale = (height - padding) / VIEWPORT_HEIGHT;
  const scale = Math.min(1, xScale, yScale);
  wrapper.style.transform = `translate(-50%, -50%) scale(${scale})`;
};

const detectTankMineCollision = (): void => {
  if (isGameOver) {
    return;
  }

  const hitIndex = mines.findIndex((mine) => {
    if (!isMineArmed(mine, MINE_ARM_MS)) {
      return false;
    }
    const collidingWithTank = circleRectColliding(mine, userTank);
    const collidingWithAnyCornerPoint = getRectangleCornerPointsAfterRotate(userTank)
      .some((point) => circleRectColliding(mine, point));
    return collidingWithTank || collidingWithAnyCornerPoint;
  });

  if (hitIndex === -1) {
    return;
  }

  userTank.lives = Math.max(0, userTank.lives - 25);
  mines.splice(hitIndex, 1);

  if (userTank.lives <= 0) {
    isGameOver = true;
    userTank.mod = 0;
    userTank.velocity.x = 0;
    userTank.velocity.y = 0;
    clearKeys(keys);
    gameOverPanel.classList.add('opened');
  }

  sendMessage({ type: ClientMessageType.UpdateTank, payload: { tank: userTank } });
  sendMessage({ type: ClientMessageType.UpdateMines, payload: { mines } });
};

const drawTankOnMinimap = (tank: Tank): void => {
  const { x, y, color } = tank;
  ctxMinimap.beginPath();
  ctxMinimap.fillStyle = color;
  ctxMinimap.strokeStyle = lighterColor(color, 30);
  ctxMinimap.arc(x, y, 15, 0, 2 * Math.PI);
  ctxMinimap.fill();
  ctxMinimap.stroke();
};

const drawWalls = (): void => {
  ctxWalls.clearRect(0, 0, maxGameWidth, maxGameHeight);
  walls.forEach((wall) => {
    wall.path = new Path2D();
    wall.path.rect(wall.x, wall.y, wall.width, wall.height);
  });
};

const drawWallsMinimap = (): void => {
  ctxWallsMinimap.clearRect(0, 0, maxGameWidth, maxGameHeight);
  walls.forEach((wall) => {
    ctxWallsMinimap.fillStyle = '#263425';
    wall.path = new Path2D();
    wall.path.rect(wall.x, wall.y, wall.width, wall.height);
    ctxWallsMinimap.fill(wall.path);
  });

  ctxWallsMinimap.fillStyle = '#26bfd0';
  waterFields.forEach((water) => {
    ctxWallsMinimap.fill(water.getPath());
  });
};

const syncCameraToTank = (): void => {
  threeScene?.render({ userTank, remoteTanks, mines });
};

const draw = (): void => {
  ctxMinimap.clearRect(0, 0, canvasMinimap.width, canvasMinimap.height);
  threeScene?.render({ userTank, remoteTanks, mines });
  remoteTanks.forEach((tank) => drawTankOnMinimap(tank));
  drawTankOnMinimap(userTank);
};

const canPutMine = (): boolean => !isGameOver && Date.now() - lastMineTime > MINE_COOLDOWN_MS;

const putMine = (): void => {
  if (!canPutMine()) {
    return;
  }
  mines.push({
    x: userTank.x,
    y: userTank.y,
    size: 15,
    time: Date.now(),
    ownerUid: userTank.uid,
  });
  lastMineTime = Date.now();
  sendMessage({ type: ClientMessageType.UpdateMines, payload: { mines } });
};

const updateHud = (): void => {
  const lives = Math.max(0, Math.round(userTank.lives));
  const mineCooldown = Math.max(0, MINE_COOLDOWN_MS - (Date.now() - lastMineTime));
  hpFill.style.width = `${lives}%`;
  hpFill.style.background = lives <= 25 ? 'var(--danger)' : 'var(--accent)';
  hpValue.textContent = String(lives);
  mineStatus.textContent = mineCooldown ? `${Math.ceil(mineCooldown / 1000)}s` : 'Ready';
  playersCount.textContent = String(remoteTanks.length + 1);
};

const resetTankState = (): void => {
  userTank.lives = 100;
  userTank.x = playerSpawn.x;
  userTank.y = playerSpawn.y;
  userTank.angle = playerSpawn.angle;
  userTank.mod = 0;
  userTank.tracksShift = [0, 0];
  userTank.traces = [];
  userTank.velocity.x = 0;
  userTank.velocity.y = 0;
  clearKeys(keys);
  lastMineTime = 0;
  isGameOver = false;
  gameOverPanel.classList.remove('opened');
  syncCameraToTank();
};

const encodeMessage = (message: ClientMessage): string => JSON.stringify(message);
const decodeMessage = (message: string): WsMessage => JSON.parse(message) as WsMessage;

const canSendMessage = (): boolean => webSocket?.readyState === WebSocket.OPEN;

function sendMessage(data: ClientMessage): void {
  if (!canSendMessage() || !webSocket) {
    return;
  }
  webSocket.send(encodeMessage(data));
}

const runWsConnection = (): void => {
  if (webSocket !== null) {
    console.warn('WS connection is already opened');
    return;
  }
  let restartAttempts = 0;

  const startWs = (): void => {
    if (!currentBattle) {
      setBattleStatus('Create or join a battle first');
      return;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const params = new URLSearchParams({
      battleId: currentBattle.id,
      playerId: currentPlayerId,
      nick: sanitizeNick(),
    });
    webSocket = new WebSocket(`${protocol}//${window.location.host}${webSocketPath}?${params}`);
    webSocket.onopen = () => {
      restartAttempts = 0;
      document.querySelector('.message.error-connection')?.classList.remove('opened');
      document.querySelector('.message.connected')?.classList.add('opened');
      setTimeout(() => {
        document.querySelector('.message.connected')?.classList.remove('opened');
      }, 1000);
    };
    webSocket.onmessage = (message) => {
      if (typeof message.data !== 'string') {
        return;
      }
      const decodedMessage = decodeMessage(message.data);
      const { type, payload } = decodedMessage;
      switch (type) {
        case WsMessageType.SetId:
          userTank.uid = payload.id;
          currentBattle = payload.battle;
          setBattleStatus(formatBattleStatus(payload.battle));
          if (userTank.color === '#000000') {
            userTank.color = getRandomColor();
          }
          sendMessage({ type: ClientMessageType.AddTank, payload: { tank: userTank } });
          break;
        case WsMessageType.BattleState:
          currentBattle = payload.battle;
          setBattleStatus(formatBattleStatus(payload.battle));
          if (payload.battle.status === BattleStatus.Finished) {
            isGameOver = true;
            userTank.mod = 0;
            userTank.velocity.x = 0;
            userTank.velocity.y = 0;
            gameOverPanel.classList.add('opened');
          }
          break;
        case WsMessageType.TanksData:
          remoteTanks.length = 0;
          payload.tanks
            .filter((tank) => tank.uid === userTank.uid)
            .forEach((tank) => Object.assign(userTank, tank, { drawDot: false }));
          remoteTanks.push(...payload.tanks.filter((tank) => tank.uid !== userTank.uid));
          updateHud();
          break;
        case WsMessageType.MinesData:
          mines.length = 0;
          mines.push(...payload.mines);
          break;
      }
    };

    webSocket.onclose = () => {
      document.querySelector('.message.error-connection')?.classList.add('opened');
      webSocket = null;
      if (restartAttempts > 5) {
        console.error('Maximum WS restart attempts reached');
        return;
      }
      restartAttempts++;
      setTimeout(startWs, 1000);
    };

    webSocket.onerror = (error) => {
      console.error(error);
    };
  };

  startWs();
};

const update = (delta: number): void => {
  const now = Date.now();
  const { w, s, a, d } = keys;
  const oldAngle = userTank.angle;
  const oldTraces = userTank.traces;

  if (isGameOver) {
    updateHud();
    return;
  }

  isTankOnWater = isPointInWater(ctxWalls, waterFields, getRectangleCornerPointsAfterRotate(userTank));

  if (w) {
    userTank.mod = 1;
    userTank.tracksShift[0] += 60 * delta;
    userTank.tracksShift[1] += 60 * delta;
  }
  if (s) {
    userTank.mod = -1;
    userTank.tracksShift[0] -= 60 * delta;
    userTank.tracksShift[1] -= 60 * delta;
  }
  if (!s && !w) {
    userTank.mod = 0;
  }
  if (a) {
    userTank.angle -= 300 * delta;
    userTank.tracksShift[0] -= 60 * delta;
    userTank.tracksShift[1] += 60 * delta;
  }
  if (d) {
    userTank.angle += 300 * delta;
    userTank.tracksShift[0] += 60 * delta;
    userTank.tracksShift[1] -= 60 * delta;
  }
  if (keys.shift) {
    putMine();
  }

  if (userTank.angle > 360) {
    userTank.angle -= 360;
  } else if (userTank.angle < 0) {
    userTank.angle += 360;
  }

  const oldX = userTank.x;
  const oldY = userTank.y;
  const friction = isTankOnWater ? userTank.friction + 0.05 : userTank.friction;
  const force = isTankOnWater ? userTank.force - 90 : userTank.force;
  const aX = userTank.speed * userTank.mod * Math.cos((Math.PI / 180) * userTank.angle) * force;
  const aY = userTank.speed * userTank.mod * Math.sin((Math.PI / 180) * userTank.angle) * force;
  const frictionStep = Math.pow(friction, delta / (1 / 60));

  userTank.velocity.x *= frictionStep;
  userTank.velocity.y *= frictionStep;
  userTank.velocity.x += aX * delta;
  userTank.velocity.y += aY * delta;
  userTank.x += userTank.velocity.x * delta;
  userTank.y += userTank.velocity.y * delta;

  syncCameraToTank();

  const points = getRectangleCornerPointsAfterRotate(userTank);
  userTank.traces = userTank.traces.filter(({ time }) => now - time < 2000);

  walls.forEach((wall) => {
    points.forEach((point) => {
      if (!ctxWalls.isPointInPath(wall.path, point.x, point.y, 'nonzero')) {
        return;
      }

      if (point.x <= wall.x + wall.width && userTank.x <= oldX && userTank.x > wall.x + wall.width) {
        userTank.x = oldX;
        if (d || a) {
          userTank.angle = oldAngle;
        } else if ((w || s) && userTank.angle % 90 !== 0) {
          userTank.angle = point.gamma % 360 ? userTank.angle - 2 : userTank.angle + 2;
        }
      }
      if (point.x >= wall.x && userTank.x >= oldX && userTank.x < wall.x) {
        userTank.x = oldX;
        if (d || a) {
          userTank.angle = oldAngle;
        } else if ((w || s) && userTank.angle % 90 !== 0) {
          userTank.angle = point.gamma > 180 ? userTank.angle - 2 : userTank.angle + 2;
        }
      }
      if (point.y <= wall.y + wall.height && userTank.y <= oldY && userTank.y > wall.y + wall.height) {
        userTank.y = oldY;
        if (d || a) {
          userTank.angle = oldAngle;
        } else if ((w || s) && userTank.angle % 90 !== 0) {
          userTank.angle = point.gamma % 360 ? userTank.angle - 2 : userTank.angle + 2;
        }
      }
      if (point.y >= wall.y && userTank.y >= oldY && userTank.y < wall.y) {
        userTank.y = oldY;
        if (d || a) {
          userTank.angle = oldAngle;
        } else if ((w || s) && userTank.angle % 90 !== 0) {
          userTank.angle = point.gamma < 90 ? userTank.angle - 2 : userTank.angle + 2;
        }
      }
    });
  });

  let sendNewTankData = false;
  if (round(oldX) !== round(userTank.x) || round(oldY) !== round(userTank.y) || round(oldAngle) !== round(userTank.angle)) {
    userTank.traces.push({
      x: oldX,
      y: oldY,
      angle: oldAngle,
      time: Date.now(),
    });
    sendNewTankData = true;
  }
  if (sendNewTankData || oldTraces.length !== userTank.traces.length) {
    sendMessage({ type: ClientMessageType.UpdateTank, payload: { tank: userTank } });
  }
  updateHud();
};

const loop = (timestamp: number): void => {
  if (!isGameStarted) {
    return;
  }
  if (!lastFrameTime) {
    lastFrameTime = timestamp;
  }
  const delta = Math.min((timestamp - lastFrameTime) / 1000, 0.05);
  lastFrameTime = timestamp;
  update(delta);
  draw();
  detectTankMineCollision();
  updateHud();
  requestAnimationFrame(loop);
};

const setupCanvas = (): void => {
  canvas.width = VIEWPORT_WIDTH;
  canvas.height = VIEWPORT_HEIGHT;
  threeScene = createThreeBattleScene({
    canvas,
    walls,
    waterFields,
    getBounds: () => ({ width: maxGameWidth, height: maxGameHeight }),
  });
  canvasWalls.width = maxGameWidth;
  canvasWalls.height = maxGameHeight;
  canvasWalls.style.display = 'none';
  canvasWallsMinimap.width = maxGameWidth;
  canvasWallsMinimap.height = maxGameHeight;
  canvasMinimap.width = maxGameWidth;
  canvasMinimap.height = maxGameHeight;
  const minimapScale = `scale(calc(1 / (${maxGameWidth} / ${MINIMAP_WIDTH})), calc(1 / (${maxGameHeight} / ${minimapHeight})))`;
  canvasWallsMinimap.style.transform = minimapScale;
  canvasMinimap.style.transform = minimapScale;
  const minimapInner = minimapContainer.querySelector<HTMLElement>('div');
  if (minimapInner) {
    minimapInner.style.height = `${minimapHeight}px`;
  }
};

const startGameWorld = (): void => {
  if (!currentBattle) {
    setBattleStatus('Create or join a battle first');
    return;
  }
  resetTankState();
  menuBoard.classList.add('hidden');
  wrapper.style.display = 'block';
  resize();
  drawWallsMinimap();
  drawWalls();
  threeScene?.rebuildStatic();
  updateHud();

  if (!webSocket) {
    runWsConnection();
  } else {
    sendMessage({ type: ClientMessageType.UpdateTank, payload: { tank: userTank } });
  }

  isGameStarted = true;
  lastFrameTime = 0;
  requestAnimationFrame(loop);
};

const newGame = async (): Promise<void> => {
  if (isGameStarted) {
    return;
  }

  startGameWorld();
};

const bindEvents = (): void => {
  createBattleButton.addEventListener('click', () => {
    createBattleButton.disabled = true;
    setBattleStatus('Creating battle...');
    void createBattleSession()
      .catch((error) => {
        setBattleStatus(error instanceof Error ? error.message : 'Could not create battle');
      })
      .finally(() => {
        createBattleButton.disabled = false;
      });
  });
  joinBattleButton.addEventListener('click', () => {
    joinBattleButton.disabled = true;
    setBattleStatus('Joining battle...');
    void joinBattleSession()
      .catch((error) => {
        setBattleStatus(error instanceof Error ? error.message : 'Could not join battle');
      })
      .finally(() => {
        joinBattleButton.disabled = false;
      });
  });
  nickInput.addEventListener('input', () => {
    localStorage.setItem(STORAGE_KEYS.nick, sanitizeNick());
  });
  controlsButton.addEventListener('click', () => {
    controlsPanel.classList.toggle('opened');
  });
  respawnButton.addEventListener('click', () => {
    resetTankState();
    sendMessage({ type: ClientMessageType.UpdateTank, payload: { tank: userTank } });
  });

  window.addEventListener('keydown', (event) => {
    if (!isGameStarted) {
      return;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
    switchKey(keys, event, true);
    if (event.code === 'KeyM') {
      minimapContainer.style.display = 'flex';
    }
  }, false);

  window.addEventListener('keyup', (event) => {
    if (!isGameStarted) {
      return;
    }
    switchKey(keys, event, false);
    if (event.code === 'KeyM') {
      minimapContainer.style.display = 'none';
    }
  }, false);

  window.addEventListener('resize', resize, false);
  window.addEventListener('beforeunload', () => {
    if (!isGameStarted) {
      return;
    }
    sendMessage({ type: ClientMessageType.LeftGame, payload: { uid: userTank.uid } });
  });
  window.addEventListener('blur', () => {
    if (!isGameStarted) {
      return;
    }
    clearKeys(keys);
  });

  const touchEventHandler = (event: TouchEvent): void => {
    if (!isGameStarted || isGameOver) {
      return;
    }
    event.preventDefault();
    const touch = event.touches[0];
    if (!touch) {
      return;
    }
    const rect = joyStick.getBoundingClientRect();
    const radius = rect.width / 2;
    const maxDistance = radius - 20;
    const rawX = touch.clientX - rect.x - radius;
    const rawY = touch.clientY - rect.y - radius;
    const distance = Math.min(Math.sqrt(rawX ** 2 + rawY ** 2), maxDistance);
    const direction = Math.atan2(rawY, rawX);
    const posX = radius + Math.cos(direction) * distance;
    const posY = radius + Math.sin(direction) * distance;
    const angleRadians = Math.atan2(posX - radius, radius - posY);
    const angle = (radiansToDegrees(angleRadians) + 360) % 360;
    userTank.angle = angle - 90;
    keys.w = true;
    joyStickDot.style.left = `${posX}px`;
    joyStickDot.style.top = `${posY}px`;
  };

  joyStick.addEventListener('touchstart', touchEventHandler);
  joyStick.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });
  joyStick.addEventListener('touchmove', touchEventHandler);
  joyStick.addEventListener('touchend', () => {
    keys.w = false;
    joyStickDot.style.left = '50%';
    joyStickDot.style.top = '50%';
  });
  touchMineButton.addEventListener('click', putMine);
};

const restoreSavedSession = async (): Promise<void> => {
  nickInput.value = localStorage.getItem(STORAGE_KEYS.nick) || '';
  battleIdInput.value = localStorage.getItem(STORAGE_KEYS.battleId) || '';

  if (!nickInput.value || !battleIdInput.value) {
    return;
  }

  setBattleStatus('Rejoining saved battle...');
  try {
    await joinBattleSession(battleIdInput.value);
  } catch (error) {
    setBattleStatus(error instanceof Error ? error.message : 'Saved battle is unavailable');
  }
};

void loadGameConfig().finally(() => {
  setupCanvas();
  bindEvents();
  resize();
  void restoreSavedSession();
});
