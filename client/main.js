window.onload = function () {
    window.addEventListener("keydown", keypress_handler, false);
    window.addEventListener("keyup", keyup_handler, false);
    window.addEventListener("resize", resize, false);

    const imagesToLoad = 2;
    let loaded = 0;

    PATTERNS.BLOCK_1.src = 'block1.png';
    PATTERNS.BLOCK_2.src = 'block2.png';
    const loadFn = () => {
        loaded++;

        if (loaded === imagesToLoad) {

            drawWalls();
            loop();
            resize();
        }
    }
    PATTERNS.BLOCK_1.onload = loadFn
    PATTERNS.BLOCK_2.onload = loadFn
};

function update() {
    const {w, s, a, d} = keys;
    const oldAngle = userTank.angle;
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

    if (userTank.angle > 360) {
        userTank.angle = userTank.angle - 360
    }

    const oldX = userTank.x;
    const oldY = userTank.y;
    userTank.x += (userTank.speed * userTank.mod) * Math.cos(Math.PI / 180 * userTank.angle);
    userTank.y += (userTank.speed * userTank.mod) * Math.sin(Math.PI / 180 * userTank.angle);

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
        })
    })
}

function drawTank(tank) {
    const {x, y, width, height, angle, color, tracksShift} = tank;

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
    roundRect(ctx, 30 - (width / 2), 15 - (height / 2), 30, 10, {tl: 3, tr: 3, bl: 5, br: 5}, barrelColor, '#9dbed5')

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
        ctxWalls.fillStyle = ctx.createPattern(PATTERNS.BLOCK_2, 'repeat');
        // ctxWalls.fillStyle = wall.color;
        wall.path.rect(
            wall.x,
            wall.y,
            wall.width,
            wall.height
        );
        ctxWalls.fill(wall.path);
    })
    ctxWalls.restore();
}

function translateWalls() {
    canvasWalls.style.transform = `translate(${canvasShift.x}px,${canvasShift.y}px)`
}

function draw() {
    ctx.clearRect(0, 0, 800, 800);
    TANKS.forEach(tank => drawTank(tank));
    drawTank(userTank);
}

function loop() {
    update();
    draw();
    setTimeout(() => {
        requestAnimationFrame(loop)
    }, 30)
}

