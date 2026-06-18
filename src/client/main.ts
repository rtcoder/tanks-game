import './style.css';
import { loadAssets } from './game/assets';
import { circleRectColliding, isMineArmed, isPointInWater } from './game/collisions';
import { MINIMAP_WIDTH, MINE_ARM_MS, MINE_COOLDOWN_MS, STORAGE_KEYS, VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from './game/constants';
import { clearKeys, switchKey } from './game/input';
import { createWalls, createWaterFields } from './game/map';
import { getRectangleCornerPointsAfterRotate, radiansToDegrees, round } from './game/math';
import { getRandomColor, lighterColor, roundRect } from './game/rendering';
import { createBattle, formatBattleStatus, joinBattle } from './network/battles';
import { contexts, dom } from './ui/dom';
import type { BattleSummary, ClientMessage, GameConfig, ImageKey, KeysState, Mine, Point, Tank, WsMessage } from '../shared/types';

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
const images: Partial<Record<ImageKey, HTMLImageElement>> = {};
const canvasShift: Point = { x: 0, y: 0 };

let lastMineTime = 0;
let isTankOnWater = false;
let isGameStarted = false;
let isGameOver = false;
let lastFrameTime = 0;
let areAssetsReady = false;
let webSocket: WebSocket | null = null;
let currentBattle: BattleSummary | null = null;
let currentPlayerId = localStorage.getItem(STORAGE_KEYS.playerId) || crypto.randomUUID();

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
  ctx,
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

const getPattern = (
  context: CanvasRenderingContext2D,
  imageKey: ImageKey,
): CanvasPattern | string => {
  const image = images[imageKey];
  return image ? context.createPattern(image, 'repeat') ?? '#333333' : '#333333';
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

  sendMessage({ type: 'UPDATE_TANK', payload: { tank: userTank } });
  sendMessage({ type: 'UPDATE_MINES', payload: { mines } });
};

const drawTankTraces = (tank: Tank): void => {
  const { width, height, traces } = tank;
  const now = Date.now();

  traces.forEach((trace) => {
    let color: string;
    if (now - trace.time < 1000) {
      color = 'rgba(54, 54, 54, 0.15)';
    } else if (now - trace.time < 1500) {
      color = 'rgba(54, 54, 54, 0.1)';
    } else {
      color = 'rgba(54, 54, 54, 0.05)';
    }
    ctx.save();
    ctx.translate(trace.x + canvasShift.x, trace.y + canvasShift.y);
    ctx.rotate((Math.PI / 180) * trace.angle);
    roundRect(ctx, 0 - width / 2, 0 - height / 2, 25, 10, 5, color);
    roundRect(ctx, 0 - width / 2, 30 - height / 2, 25, 10, 5, color);
    ctx.restore();
  });
};

const drawMines = (): void => {
  mines.forEach((mine) => {
    const { x, y, size } = mine;
    ctx.save();
    ctx.translate(x + canvasShift.x, y + canvasShift.y);
    ctx.fillStyle = isMineArmed(mine, MINE_ARM_MS) ? '#850000' : '#067200';
    ctx.beginPath();
    ctx.strokeStyle = '#a2a2a2';
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  });
};

const shouldDrawDotTank = (tank: Tank): { newX: number; newY: number } | null => {
  const { x, y, width, height } = tank;
  let newX = x + canvasShift.x;
  let newY = y + canvasShift.y;
  if (y === userTank.y) {
    return null;
  }

  if (!(y + canvasShift.y < -height / 2 || x + canvasShift.x < -width / 2)) {
    tank.drawDot = false;
  }
  if (y + canvasShift.y < -height / 2 || (tank.drawDot && y + canvasShift.y < 0)) {
    newY = userTank.y > y ? 5 : canvas.height - 5;
    tank.drawDot = true;
  }
  if (x + canvasShift.x < -width / 2 || (tank.drawDot && x + canvasShift.x < 0)) {
    newX = userTank.x > x ? 5 : canvas.width - 5;
    tank.drawDot = true;
  }
  return tank.drawDot ? { newX, newY } : null;
};

const drawDotTank = (newX: number, newY: number, color: string): void => {
  ctx.beginPath();
  ctx.fillStyle = color;
  ctx.strokeStyle = lighterColor(color, 30);
  ctx.arc(newX, newY, 5, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
};

const drawTank = (tank: Tank): void => {
  const { x, y, width, height, angle, color, tracksShift, lives } = tank;
  const drawDotTankVal = shouldDrawDotTank(tank);
  if (drawDotTankVal) {
    drawDotTank(drawDotTankVal.newX, drawDotTankVal.newY, color);
    return;
  }

  ctx.save();
  ctx.translate(x + canvasShift.x, y + canvasShift.y);
  ctx.rotate((Math.PI / 180) * angle);
  ctx.beginPath();
  ctx.fillStyle = color;
  ctx.fillRect(5 - width / 2, 0 - height / 2, 40, 40);
  ctx.fill();

  roundRect(ctx, 30 - width / 2, 15 - height / 2, 30, 10, { tl: 3, tr: 3, bl: 5, br: 5 }, lighterColor(color, 50), '#9dbed5');
  roundRect(ctx, 0 - width / 2, 0 - height / 2, 50, 10, 5, '#363636');
  roundRect(ctx, 0 - width / 2, 30 - height / 2, 50, 10, 5, '#363636');

  ctx.beginPath();
  ctx.fillStyle = '#676767';
  const track1Shift = tracksShift[0] % 10;
  const track2Shift = tracksShift[1] % 10;
  const from = 0 - width / 2;
  const to = 0 - width / 2 + 50;
  for (let i = 0; i < 5; i++) {
    const linePos = i * 10;
    if (from <= from + linePos + track1Shift && to >= from + linePos + track1Shift + 2) {
      ctx.fillRect(from + linePos + track1Shift, 2 - height / 2, 2, 6);
    }
    if (from <= from + linePos + track2Shift && to >= from + linePos + track2Shift + 2) {
      ctx.fillRect(from + linePos + track2Shift, 32 - height / 2, 2, 6);
    }
  }
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(x + canvasShift.x, y + canvasShift.y);
  roundRect(ctx, 0 - width / 2, 0 - height / 2 - 20, 50, 10, 5, '#363636', '#fff');
  roundRect(ctx, 0 - width / 2, 0 - height / 2 - 19, 50 * (lives / 100), 8, 5, '#679d37');
  ctx.restore();
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
    ctxWalls.fillStyle = getPattern(ctxWalls, 'BLOCK_2');
    wall.path = new Path2D();
    wall.path.rect(wall.x, wall.y, wall.width, wall.height);
    ctxWalls.fill(wall.path);
  });

  ctxWalls.fillStyle = getPattern(ctxWalls, 'WATER');
  waterFields.forEach((water) => {
    ctxWalls.fill(water.getPath());
  });
};

const drawWallsMinimap = (): void => {
  ctxWallsMinimap.clearRect(0, 0, maxGameWidth, maxGameHeight);
  walls.forEach((wall) => {
    ctxWallsMinimap.fillStyle = getPattern(ctxWallsMinimap, 'BLOCK_2');
    wall.path = new Path2D();
    wall.path.rect(wall.x, wall.y, wall.width, wall.height);
    ctxWallsMinimap.fill(wall.path);
  });

  ctxWallsMinimap.fillStyle = getPattern(ctxWallsMinimap, 'WATER');
  waterFields.forEach((water) => {
    ctxWallsMinimap.fill(water.getPath());
  });
};

const translateWalls = (): void => {
  canvasWalls.style.transform = `translate(${canvasShift.x}px, ${canvasShift.y}px)`;
};

const syncCameraToTank = (): void => {
  canvasShift.x = 0;
  canvasShift.y = 0;

  if (userTank.x > canvas.width / 2 && userTank.x < maxGameWidth - canvas.width / 2) {
    canvasShift.x = canvas.width / 2 - userTank.x;
  }
  if (userTank.y > canvas.height / 2 && userTank.y < maxGameHeight - canvas.height / 2) {
    canvasShift.y = canvas.height / 2 - userTank.y;
  }

  translateWalls();
};

const draw = (): void => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctxMinimap.clearRect(0, 0, canvasMinimap.width, canvasMinimap.height);
  drawMines();
  remoteTanks.forEach((tank) => drawTankTraces(tank));
  drawTankTraces(userTank);
  remoteTanks.forEach((tank) => drawTank(tank));
  drawTank(userTank);
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
  sendMessage({ type: 'UPDATE_MINES', payload: { mines } });
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
        case 'SET_ID':
          userTank.uid = payload.id;
          currentBattle = payload.battle;
          setBattleStatus(formatBattleStatus(payload.battle));
          if (userTank.color === '#000000') {
            userTank.color = getRandomColor();
          }
          sendMessage({ type: 'ADD_TANK', payload: { tank: userTank } });
          break;
        case 'BATTLE_STATE':
          currentBattle = payload.battle;
          setBattleStatus(formatBattleStatus(payload.battle));
          if (payload.battle.status === 'finished') {
            isGameOver = true;
            userTank.mod = 0;
            userTank.velocity.x = 0;
            userTank.velocity.y = 0;
            gameOverPanel.classList.add('opened');
          }
          break;
        case 'TANKS_DATA':
          remoteTanks.length = 0;
          payload.tanks
            .filter((tank) => tank.uid === userTank.uid)
            .forEach((tank) => Object.assign(userTank, tank, { drawDot: false }));
          remoteTanks.push(...payload.tanks.filter((tank) => tank.uid !== userTank.uid));
          updateHud();
          break;
        case 'MINES_DATA':
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

  isTankOnWater = isPointInWater(ctx, waterFields, getRectangleCornerPointsAfterRotate(userTank));

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

  let redrawWalls = false;
  if (userTank.x > canvas.width / 2) {
    if (userTank.x < maxGameWidth - canvas.width / 2) {
      canvasShift.x = canvas.width / 2 - userTank.x;
      redrawWalls = true;
    }
  } else if (canvasShift.x !== 0) {
    canvasShift.x = 0;
    redrawWalls = true;
  }
  if (userTank.y > canvas.height / 2) {
    if (userTank.y < maxGameHeight - canvas.height / 2) {
      canvasShift.y = canvas.height / 2 - userTank.y;
      redrawWalls = true;
    }
  } else if (canvasShift.y !== 0) {
    canvasShift.y = 0;
    redrawWalls = true;
  }
  if (redrawWalls) {
    translateWalls();
  }

  const points = getRectangleCornerPointsAfterRotate(userTank);
  userTank.traces = userTank.traces.filter(({ time }) => now - time < 2000);

  walls.forEach((wall) => {
    points.forEach((point) => {
      if (!ctx.isPointInPath(wall.path, point.x, point.y, 'nonzero')) {
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
    sendMessage({ type: 'UPDATE_TANK', payload: { tank: userTank } });
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
  canvasWalls.width = maxGameWidth;
  canvasWalls.height = maxGameHeight;
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
  updateHud();

  if (!webSocket) {
    runWsConnection();
  } else {
    sendMessage({ type: 'UPDATE_TANK', payload: { tank: userTank } });
  }

  isGameStarted = true;
  lastFrameTime = 0;
  requestAnimationFrame(loop);
};

const newGame = async (): Promise<void> => {
  if (isGameStarted) {
    return;
  }

  if (!areAssetsReady) {
    Object.assign(images, await loadAssets());
    areAssetsReady = true;
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
    sendMessage({ type: 'UPDATE_TANK', payload: { tank: userTank } });
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
    sendMessage({ type: 'LEFT_GAME', payload: { uid: userTank.uid } });
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
