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

  const barrelColor = lighter_color(color, 50);

  ctx.save();
  ctx.translate(x + canvasShift.x, y + canvasShift.y);
  ctx.rotate(Math.PI / 180 * angle);
  ctx.beginPath();
  ctx.fillStyle = color;
  ctx.fillRect(5 - (width / 2), 0 - (height / 2), 40, 40);
  ctx.fill();

  roundRect(ctx, 30 - (width / 2), 15 - (height / 2), 30, 10, {tl: 3, tr: 3, bl: 5, br: 5}, barrelColor, '#9dbed5');

  // -- TRACKS --
  roundRect(ctx, 0 - (width / 2), 0 - (height / 2), 50, 10, 5, '#363636',);
  roundRect(ctx, 0 - (width / 2), 30 - (height / 2), 50, 10, 5, '#363636',);

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

  // health bar
  roundRect(ctx, 0 - (width / 2), 0 - (height / 2) - 20, 50, 10, 5, '#363636', '#fff');
  roundRect(ctx, 0 - (width / 2), 0 - (height / 2) - 19, 50 * (lives / 100), 8, 5, '#679d37');


  ctx.restore();
}

function drawTankOnMinimap(tank) {
  const {x, y, color} = tank;
  ctxMinimap.beginPath();
  ctxMinimap.fillStyle = color;
  ctxMinimap.strokeStyle = lighter_color(color, 30);
  ctxMinimap.arc(x, y, 15, 0, 2 * Math.PI);
  ctxMinimap.fill();
  ctxMinimap.stroke();
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
  ctx.fillStyle = color;
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
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctxMinimap.clearRect(0, 0, canvasMinimap.width, canvasMinimap.height);
  drawMines();
  TANKS.map(tank => drawTankTraces(tank));
  drawTankTraces(userTank);
  TANKS.forEach(tank => drawTank(tank));
  drawTank(userTank);
  TANKS.forEach(tank => drawTankOnMinimap(tank));
  drawTankOnMinimap(userTank);
}
