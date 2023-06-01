const IMAGES = {};

function newGame() {
  if (IS_GAME_STARTED) {
    return;
  }
  loadAssets().then(({images}) => {
    Object.assign(IMAGES, images);

    loop();
    resize();
    drawWallsMinimap();
    drawWalls();

    runWsConnection();

    IS_GAME_STARTED = true;
    wrapper.style.display = 'block';

  });

}

window.onload = function () {
  window.addEventListener('keydown', e => {
    if (!IS_GAME_STARTED) {
      return;
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
    const {clientX, clientY} = e.touches[0];
    const rect = joyStick.getBoundingClientRect();
    let posX = clientX - rect.x;
    let posY = clientY - rect.y;
    const radius = 75;
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
  // window.addEventListener('focus', () => {
  //   const tank = getFromLs('TANK');
  //   if (tank) {
  //     Object.assign(userTank, JSON.parse(tank));
  //   }
  // });
  // window.addEventListener('storage', e => {
  //   if (!e.newValue) {
  //     return;
  //   }
  //   if (e.key === 'openpages') {
  //     // Emit that you're already available.
  //     localStorage.page_available = Date.now();
  //   }
  //   if (e.key === 'page_available') {
  //     IS_GAME_IN_ANOTHER_TAB = true;
  //     Object.assign(userTank, JSON.parse(getFromLs('TANK')));
  //   }
  // }, false);

  // localStorage.openpages = Date.now();
  (function setupCanvas() {
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
  newGame();
};

function canPutMine() {
  return Date.now() - LAST_MINE_TIME > 2000;
}

function update() {
  const now = Date.now();
  const {w, s, a, d} = keys;
  const oldAngle = userTank.angle;
  const oldTraces = userTank.traces;
  IS_TANK_ON_WATER = isPointInWater(getRectangleCornerPointsAfterRotate(userTank));

  if (w) {
    userTank.mod = 1;
    userTank.tracksShift[0]++;
    userTank.tracksShift[1]++;
  }
  if (s) {
    userTank.mod = -1;
    userTank.tracksShift[0]--;
    userTank.tracksShift[1]--;
  }
  if (!s && !w) {
    userTank.mod = 0;
  }
  if (a) {
    userTank.angle -= 5;
    userTank.tracksShift[0]--;
    userTank.tracksShift[1]++;
  }
  if (d) {
    userTank.angle += 5;
    userTank.tracksShift[0]++;
    userTank.tracksShift[1]--;
  }
  if (keys.shift) {
    if (canPutMine()) {
      MINES.push({
        x: userTank.x,
        y: userTank.y,
        size: 15,
        time: Date.now()
      });
      LAST_MINE_TIME = Date.now();
      sendMessage({type: 'UPDATE_MINES', payload: {mines: MINES}});
    }
  }

  if (userTank.angle > 360) {
    userTank.angle = userTank.angle - 360;
  }

  const oldX = userTank.x;
  const oldY = userTank.y;
  const friction = IS_TANK_ON_WATER ? userTank.friction + 0.05 : userTank.friction;
  const force = IS_TANK_ON_WATER ? userTank.force - 90 : userTank.force;
  const aX = (userTank.speed * userTank.mod) * Math.cos(Math.PI / 180 * userTank.angle) * userTank.force;
  const aY = (userTank.speed * userTank.mod) * Math.sin(Math.PI / 180 * userTank.angle) * userTank.force;

  userTank.velocity.x *= friction;
  userTank.velocity.y *= friction;
  const delta = (60 / 1000);
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
}

function isMineArmored({time}) {
  const now = Date.now();
  return now - time > 1500;
}

function loop() {
  update();
  draw();
  detectTankMineCollision();
  setTimeout(() => {
    requestAnimationFrame(loop);
  }, 30);
}
