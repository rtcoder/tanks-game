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

      if (ctx.isPointInPath(wall.path, point.x, point.y)) {

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

function isPointInWater(points) {
  for (const waterField of WATER_FIELDS) {
    for (const point of points) {
      if (ctx.isPointInPath(waterField.getPath(), point.x, point.y)) {
        return true;
      }
    }
  }
  return false;
}

function drawTankTraces(tank) {
  const {width, height, traces} = tank;
  const now = Date.now();

  traces.forEach(trace => {
    let color;
    if (now - trace.time < 1000) {
      color = 'rgba(54, 54, 54, 0.15)';
    } else if (now - trace.time < 1500) {
      color = 'rgba(54, 54, 54, 0.1)';
    } else {
      color = 'rgba(54, 54, 54, 0.05)';
    }
    ctx.save();
    ctx.translate(trace.x + canvasShift.x, trace.y + canvasShift.y);
    ctx.rotate(Math.PI / 180 * trace.angle);

    roundRect(ctx, 0 - (width / 2), 0 - (height / 2), 25, 10, 5, color);
    roundRect(ctx, 0 - (width / 2), 30 - (height / 2), 25, 10, 5, color);

    ctx.restore();
  });
}

function drawMines() {
  MINES.forEach(mine => {
    const {x, y, size} = mine;
    const isArmed = isMineArmored(mine);
    ctx.save();
    ctx.translate(x + canvasShift.x, y + canvasShift.y);
    ctx.fillStyle = isArmed ? '#850000' : '#067200';
    ctx.beginPath();
    ctx.strokeStyle = '#a2a2a2';
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  });
}

function drawTank(tank) {
  const {x, y, width, height, angle, color, tracksShift, lives} = tank;

  const drawDotTankVal = shouldDrawDotTank(tank);
  if (drawDotTankVal) {
    const {newX, newY} = drawDotTankVal;
    drawDotTank(newX, newY, color);
    return;
  }

  const tankColor = darker_color(color, 30);
  const barrelColor = lighter_color(color, 10);

  ctx.save();
  ctx.translate(x + canvasShift.x, y + canvasShift.y);
  ctx.rotate(Math.PI / 180 * angle);
  ctx.beginPath();
  ctx.fillStyle = tankColor;
  ctx.fillRect(5 - (width / 2), 0 - (height / 2), 40, 40);
  ctx.fill();

  roundRect(ctx, 30 - (width / 2), 15 - (height / 2), 30, 10, {tl: 3, tr: 3, bl: 5, br: 5}, barrelColor, '#9dbed5');

  // -- TRACKS --
  roundRect(ctx, 0 - (width / 2), 0 - (height / 2), 50, 10, 5, '#363636');
  roundRect(ctx, 0 - (width / 2), 30 - (height / 2), 50, 10, 5, '#363636');

  ctx.beginPath();
  ctx.fillStyle = '#676767';
  const track1Shift = tracksShift[0] % 10;
  const track2Shift = tracksShift[1] % 10;

  const from = 0 - (width / 2);
  const to = 0 - (width / 2) + 50;
  for (let i = 0; i < 5; i++) {
    const linePos = i * 10;
    if (from <= from + linePos + track1Shift && to >= from + linePos + track1Shift + 2) {
      ctx.fillRect(from + linePos + track1Shift, 2 - (height / 2), 2, 6);
    }
    if (from <= from + linePos + track2Shift && to >= from + linePos + track2Shift + 2) {
      ctx.fillRect(from + linePos + track2Shift, 32 - (height / 2), 2, 6);
    }
  }
  ctx.fill();
  // -- END TRACKS --
  ctx.restore();


  ctx.save();
  ctx.translate(x + canvasShift.x, y + canvasShift.y);

  roundRect(ctx, 0 - (width / 2), 0 - (height / 2) - 20, 50, 10, 5, '#363636', '#fff');
  roundRect(ctx, 0 - (width / 2), 0 - (height / 2) - 19, 50 * (lives / 100), 8, 5, '#679d37');


  ctx.restore();
}

function drawTankOnMinimap(tank) {
  const {x, y, width, height, angle, color, tracksShift, lives} = tank;
  ctxMinimap.beginPath();
  ctxMinimap.fillStyle = darker_color(color, 30);
  ctxMinimap.strokeStyle = lighter_color(color, 30);
  ctxMinimap.arc(x, y, 15, 0, 2 * Math.PI);
  ctxMinimap.fill();
  ctxMinimap.stroke();
}

function isMineArmored({time}) {
  const now = Date.now();
  return now - time > 1500;
}

function detectTankMineCollision() {
  MINES.filter(isMineArmored)
      .forEach((mine, i) => {
        const collidingWithTank = circleRectColliding(mine, userTank);
        const collidingWithAnyCornerPoint = getRectangleCornerPointsAfterRotate(userTank)
            .some(point => circleRectColliding(mine, point));
        if (collidingWithTank || collidingWithAnyCornerPoint) {
          userTank.lives -= 10;
          MINES.splice(i, 1);
          sendMessage({type: 'UPDATE_TANK', payload: {tank: userTank}});
          sendMessage({type: 'UPDATE_MINES', payload: {mines: MINES}});
        }
      });
}

function circleRectColliding(circle, rect) {
  const {width = 1, height = 1} = rect;
  const distX = Math.abs(circle.x - rect.x - width / 2);
  const distY = Math.abs(circle.y - rect.y - height / 2);

  if (distX > (width / 2 + circle.size)) {
    return false;
  }
  if (distY > (height / 2 + circle.size)) {
    return false;
  }

  if (distX <= (width / 2)) {
    return true;
  }
  if (distY <= (height / 2)) {
    return true;
  }

  const dx = distX - width / 2;
  const dy = distY - height / 2;
  return (dx * dx + dy * dy <= (circle.size * circle.size));
}

function shouldDrawDotTank(tank) {
  const {x, y, width, height} = tank;
  let newX = x + canvasShift.x;
  let newY = y + canvasShift.y;
  if (y !== userTank.y) {
    if (!(y + canvasShift.y < -height / 2 || x + canvasShift.x < -width / 2)) {
      tank.drawDot = false;
    }
    if (y + canvasShift.y < -height / 2
        || (tank.drawDot && y + canvasShift.y < 0)) {
      if (userTank.y > y) {
        newY = 5;
      } else {
        newY = canvas.height - 5;
      }
      tank.drawDot = true;
    }
    if (x + canvasShift.x < -width / 2
        || (tank.drawDot && x + canvasShift.x < 0)) {
      if (userTank.x > x) {
        newX = 5;
      } else {
        newX = canvas.width - 5;
      }
      tank.drawDot = true;
    }
    return tank.drawDot ? {newX, newY} : null;
  }
}

function drawDotTank(newX, newY, color) {
  ctx.beginPath();
  ctx.fillStyle = darker_color(color, 30);
  ctx.strokeStyle = lighter_color(color, 30);
  ctx.arc(newX, newY, 5, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
}

function drawWalls() {
  ctxWalls.clearRect(0, 0, 800, 800);
  ctxWalls.save();
  ctxWalls.translate(canvasShift.x, canvasShift.y);
  walls.forEach(wall => {
    ctxWalls.fillStyle = ctxWalls.createPattern(IMAGES.BLOCK_2, 'repeat');
    wall.path.rect(
        wall.x,
        wall.y,
        wall.width,
        wall.height
    );
    ctxWalls.fill(wall.path);
  });

  ctxWalls.fillStyle = ctxWalls.createPattern(IMAGES.WATER, 'repeat');
  WATER_FIELDS.forEach(water => {
    ctxWalls.fill(water.getPath());
  });

  ctxWalls.restore();
}

function drawWallsMinimap() {
  ctxWallsMinimap.clearRect(0, 0, 800, 800);
  walls.forEach(wall => {
    ctxWallsMinimap.fillStyle = ctxWallsMinimap.createPattern(IMAGES.BLOCK_2, 'repeat');
    wall.path.rect(
        wall.x,
        wall.y,
        wall.width,
        wall.height
    );
    ctxWallsMinimap.fill(wall.path);
  });

  ctxWallsMinimap.fillStyle = ctxWallsMinimap.createPattern(IMAGES.WATER, 'repeat');
  WATER_FIELDS.forEach(water => {
    ctxWallsMinimap.fill(water.getPath());
  });
}

function translateWalls() {
  canvasWalls.style.transform = `translate(${canvasShift.x}px,${canvasShift.y}px)`;
}

function draw() {
  ctx.clearRect(0, 0, 800, 800);
  ctxMinimap.clearRect(0, 0, canvasMinimap.width, canvasMinimap.height);
  drawMines();
  TANKS.map(tank => drawTankTraces(tank));
  drawTankTraces(userTank);
  TANKS.forEach(tank => drawTank(tank));
  drawTank(userTank);
  TANKS.forEach(tank => drawTankOnMinimap(tank));
  drawTankOnMinimap(userTank);

  detectTankMineCollision();
}

function loop() {
  update();
  draw();
  setTimeout(() => {
    requestAnimationFrame(loop);
  }, 30);
}
