const IMAGES = {};
let ARE_ASSETS_READY = false;

function resetTankState() {
  userTank.lives = 100;
  userTank.x = 180;
  userTank.y = 170;
  userTank.angle = 90;
  userTank.mod = 0;
  userTank.tracksShift = [0, 0];
  userTank.traces = [];
  userTank.velocity.x = 0;
  userTank.velocity.y = 0;
  canvasShift.x = 0;
  canvasShift.y = 0;
  Object.keys(keys).forEach(key => keys[key] = false);
  LAST_MINE_TIME = 0;
  IS_GAME_OVER = false;
  gameOverPanel.classList.remove('opened');
  translateWalls();
}

function startGameWorld() {
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
    sendMessage({type: 'UPDATE_TANK', payload: {tank: userTank}});
  }

  IS_GAME_STARTED = true;
  LAST_FRAME_TIME = 0;
  requestAnimationFrame(loop);
}

function newGame() {
  if (IS_GAME_STARTED) {
    return;
  }

  if (ARE_ASSETS_READY) {
    startGameWorld();
    return;
  }

  loadAssets().then(({images}) => {
    Object.assign(IMAGES, images);
    ARE_ASSETS_READY = true;
    startGameWorld();
  });
}

window.onload = function () {
  newGameButton.addEventListener('click', newGame);
  controlsButton.addEventListener('click', () => {
    controlsPanel.classList.toggle('opened');
  });
  respawnButton.addEventListener('click', () => {
    resetTankState();
    sendMessage({type: 'UPDATE_TANK', payload: {tank: userTank}});
  });

  window.addEventListener('keydown', e => {
    if (!IS_GAME_STARTED) {
      return;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    keypress_handler(e);
    if (e.code === 'KeyM') {
      minimapContainer.style.display = 'flex';
    }
  }, false);
  window.addEventListener('keyup', e => {
    if (!IS_GAME_STARTED) {
      return;
    }
    keyup_handler(e);

    if (e.code === 'KeyM') {
      minimapContainer.style.display = 'none';
    }
  }, false);
  window.addEventListener('resize', resize, false);
  window.addEventListener('beforeunload', () => {
    if (!IS_GAME_STARTED) {
      return;
    }
    sendMessage({type: 'LEFT_GAME', payload: {uid: userTank.uid}});
  });
  window.addEventListener('blur', () => {
    if (!IS_GAME_STARTED) {
      return;
    }
    Object.keys(keys).forEach(key => keys[key] = false);
  });

  function touchEventHandler(e) {
    if (!IS_GAME_STARTED || IS_GAME_OVER) {
      return;
    }
    e.preventDefault();
    const {clientX, clientY} = e.touches[0];
    const rect = joyStick.getBoundingClientRect();
    const radius = rect.width / 2;
    const maxDistance = radius - 20;
    const rawX = clientX - rect.x - radius;
    const rawY = clientY - rect.y - radius;
    const distance = Math.min(Math.sqrt(rawX ** 2 + rawY ** 2), maxDistance);
    const direction = Math.atan2(rawY, rawX);
    const posX = radius + Math.cos(direction) * distance;
    const posY = radius + Math.sin(direction) * distance;
    const angleRadians = Math.atan2(posX - radius, radius - posY);
    const angle = (radians_to_degrees(angleRadians) + 360.0) % 360.0;
    userTank.angle = angle - 90;
    keys.w = true;
    joyStickDot.style.left = `${posX}px`;
    joyStickDot.style.top = `${posY}px`;
  }

  joyStick.addEventListener('touchstart', touchEventHandler);
  joyStick.addEventListener('contextmenu', e => {
    e.preventDefault();
  });
  joyStick.addEventListener('touchmove', touchEventHandler);
  joyStick.addEventListener('touchend', e => {
    keys.w = false;
    joyStickDot.style.left = '50%';
    joyStickDot.style.top = '50%';
  });
  touchMineButton.addEventListener('click', putMine);

  (function setupCanvas() {
    canvas.width = VIEWPORT_WIDTH;
    canvas.height = VIEWPORT_HEIGHT;
    canvasWalls.width = maxGameWidth;
    canvasWalls.height = maxGameHeight;
    canvasWallsMinimap.width = maxGameWidth;
    canvasWallsMinimap.height = maxGameHeight;
    canvasMinimap.width = maxGameWidth;
    canvasMinimap.height = maxGameHeight;
    const minimapScale = `scale(calc(1 / (${maxGameWidth} / ${minimapWidth})), calc(1 / (${maxGameHeight} / ${minimapHeight})))`;
    canvasWallsMinimap.style.transform = minimapScale;
    canvasMinimap.style.transform = minimapScale;
    minimapContainer.querySelector('div').style.height = `${minimapHeight}px`;
  })();
  resize();
};

function canPutMine() {
  return !IS_GAME_OVER && Date.now() - LAST_MINE_TIME > MINE_COOLDOWN_MS;
}

function putMine() {
  if (!canPutMine()) {
    return;
  }
  MINES.push({
    x: userTank.x,
    y: userTank.y,
    size: 15,
    time: Date.now(),
    ownerUid: userTank.uid
  });
  LAST_MINE_TIME = Date.now();
  sendMessage({type: 'UPDATE_MINES', payload: {mines: MINES}});
}

function updateHud() {
  const lives = Math.max(0, Math.round(userTank.lives));
  const mineCooldown = Math.max(0, MINE_COOLDOWN_MS - (Date.now() - LAST_MINE_TIME));
  hpFill.style.width = `${lives}%`;
  hpFill.style.background = lives <= 25 ? 'var(--danger)' : 'var(--accent)';
  hpValue.textContent = String(lives);
  mineStatus.textContent = mineCooldown ? `${Math.ceil(mineCooldown / 1000)}s` : 'Ready';
  playersCount.textContent = String(TANKS.length + 1);
}

function update(delta) {
  const now = Date.now();
  const {w, s, a, d} = keys;
  const oldAngle = userTank.angle;
  const oldTraces = userTank.traces;

  if (IS_GAME_OVER) {
    updateHud();
    return;
  }

  IS_TANK_ON_WATER = isPointInWater(getRectangleCornerPointsAfterRotate(userTank));

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
    userTank.angle = userTank.angle - 360;
  } else if (userTank.angle < 0) {
    userTank.angle = userTank.angle + 360;
  }

  const oldX = userTank.x;
  const oldY = userTank.y;
  const friction = IS_TANK_ON_WATER ? userTank.friction + 0.05 : userTank.friction;
  const force = IS_TANK_ON_WATER ? userTank.force - 90 : userTank.force;
  const aX = (userTank.speed * userTank.mod) * Math.cos(Math.PI / 180 * userTank.angle) * force;
  const aY = (userTank.speed * userTank.mod) * Math.sin(Math.PI / 180 * userTank.angle) * force;

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
  } else {
    if (canvasShift.x !== 0) {
      canvasShift.x = 0;
      redrawWalls = true;
    }
  }
  if (userTank.y > canvas.height / 2) {
    if (userTank.y < maxGameHeight - canvas.height / 2) {
      canvasShift.y = canvas.height / 2 - userTank.y;
      redrawWalls = true;
    }
  } else {
    if (canvasShift.y !== 0) {
      canvasShift.y = 0;
      redrawWalls = true;
    }
  }
  if (redrawWalls) {
    translateWalls();
  }

  const points = getRectangleCornerPointsAfterRotate(userTank);

  userTank.traces = userTank.traces.filter(({time}) => now - time < 2000);

  walls.forEach((wall) => {
    points.forEach((point, i) => {

      if (ctx.isPointInPath(wall.path, point.x, point.y,'nonzero')) {

        if (
            point.x <= wall.x + wall.width
            && userTank.x <= oldX
            && userTank.x > wall.x + wall.width
        ) { // lewo
          userTank.x = oldX;
          if (d || a) {
            userTank.angle = oldAngle;
          } else if ((w || s) && userTank.angle % 90 !== 0) {
            userTank.angle = point.gamma % 360 ? userTank.angle - 2 : userTank.angle + 2;
          }
        }
        if (
            point.x >= wall.x
            && userTank.x >= oldX
            && userTank.x < wall.x
        ) { // prawo
          userTank.x = oldX;
          if (d || a) {
            userTank.angle = oldAngle;
          } else if ((w || s) && userTank.angle % 90 !== 0) {
            userTank.angle = point.gamma > 180 ? userTank.angle - 2 : userTank.angle + 2;
          }
        }

        if (
            point.y <= wall.y + wall.height
            && userTank.y <= oldY
            && userTank.y > wall.y + wall.height
        ) {// góra
          userTank.y = oldY;
          if (d || a) {
            userTank.angle = oldAngle;
          } else if ((w || s) && userTank.angle % 90 !== 0) {
            userTank.angle = point.gamma % 360 ? userTank.angle - 2 : userTank.angle + 2;
          }
        }
        if (
            point.y >= wall.y
            && userTank.y >= oldY
            && userTank.y < wall.y
        ) { //dół
          userTank.y = oldY;
          if (d || a) {
            userTank.angle = oldAngle;
          } else if ((w || s) && userTank.angle % 90 !== 0) {
            userTank.angle = point.gamma < 90 ? userTank.angle - 2 : userTank.angle + 2;
          }
        }
      }
    });
  });
  let sendNewTankData = false;
  if (round(oldX) !== round(userTank.x)
      || round(oldY) !== round(userTank.y)
      || round(oldAngle) !== round(userTank.angle)) {
    userTank.traces.push({
      x: oldX,
      y: oldY,
      angle: oldAngle,
      time: Date.now()
    });
    sendNewTankData = true;
  }
  if (sendNewTankData || oldTraces.length !== userTank.traces.length) {
    sendMessage({type: 'UPDATE_TANK', payload: {tank: userTank}});
  }
  updateHud();
}

function isMineArmored({time}) {
  const now = Date.now();
  return now - time > MINE_ARM_MS;
}

function loop(timestamp) {
  if (!IS_GAME_STARTED) {
    return;
  }
  if (!LAST_FRAME_TIME) {
    LAST_FRAME_TIME = timestamp;
  }
  const delta = Math.min((timestamp - LAST_FRAME_TIME) / 1000, 0.05);
  LAST_FRAME_TIME = timestamp;
  update(delta);
  draw();
  detectTankMineCollision();
  updateHud();
  requestAnimationFrame(loop);
}
