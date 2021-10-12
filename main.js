const keys = {
    w: false,
    s: false,
    a: false,
    d: false,
}
const userTank = {
    x: 60,
    y: 70,
    speed: 4,
    angle: 0,
    mod: 1,
    tracksShift: [0, 0],
    width: 50,
    height: 40
}
const wrapper = document.querySelector(".wrapper");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const canvasWalls = document.getElementById("canvas-walls");
const ctxWalls = canvasWalls.getContext("2d");
const maxGameWidth = 900;
const maxGameHeight = 800;
const canvasShift = {
    x: 0,
    y: 0
}

const walls = [
    {
        x: 0,
        y: 0,
        get width() {
            return maxGameWidth || 200
        },
        height: 20,
        color: 'brown',
        path: new Path2D()
    },
    {
        x: 0,
        get y() {
            return maxGameHeight - 20 || 200
        },
        get width() {
            return maxGameWidth || 200
        },
        height: 20,
        color: 'brown',
        path: new Path2D()
    },
    {
        get x() {
            return maxGameWidth - 20 || 200
        },
        y: 0,
        width: 20,
        get height() {
            return maxGameHeight || 200
        },
        color: 'brown',
        path: new Path2D()
    },
    {
        x: 0,
        y: 0,
        width: 20,
        get height() {
            return maxGameHeight || 200
        },
        color: 'brown',
        path: new Path2D()
    },

    {
        x: 100,
        y: 0,
        width: 20,
        height: 300,
        color: 'brown',
        path: new Path2D()
    },
    {
        x: 100,
        y: 300,
        width: 200,
        height: 30,
        color: 'brown',
        path: new Path2D()
    }
]

window.onload = function () {
    window.addEventListener("keydown", keypress_handler, false);
    window.addEventListener("keyup", keyup_handler, false);
    window.addEventListener("resize", resize, false);

    drawWalls();
    loop();
    resize();
};

function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    const canvasWidth = 800;
    const canvasHeight = 600;

    let xScale = 1;
    let yScale = 1;
    let scale = 1;

    if (canvasWidth > width || canvasHeight > height) {
        xScale = width / canvasWidth;
        yScale = height / canvasHeight;
        scale = yScale < xScale ? yScale : xScale;
    }
console.log({wrapper,scale})
        wrapper.style.transform = 'scale(' + scale + ') translate(-50%,-50%)'
}

function radians_to_degrees(radians) {
    return radians * (180 / Math.PI);
}

function degrees_to_radians(degrees) {
    return degrees / 180 * Math.PI;
}

function getRectangleCornerPointsAfterRotate(tank) {
    const {x, y, width, height, angle} = tank;

    const R = Math.sqrt(
        ((width / 2) ** 2) + ((height / 2) ** 2)
    );

    const beta = radians_to_degrees(
        Math.atan2(height, width)
    );

    const gammas = [
        degrees_to_radians(beta + angle),
        degrees_to_radians(beta + angle + radians_to_degrees(Math.PI)),
        degrees_to_radians(-beta + angle + radians_to_degrees(Math.PI)),
        degrees_to_radians(-beta + angle),
    ]
    const points = [];
    for (let i = 0; i < 4; i++) {
        const gamma = gammas[i];
        const Px = x + R * Math.cos(gamma);
        const Py = y + R * Math.sin(gamma);
        points.push({
            x: Px,
            y: Py,
            gamma: (radians_to_degrees(gamma) + 720) % 360
        })
    }

    return points;
}

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

function roundRect(context, x, y, width, height, radius = 5, fillColor, strokeColor) {
    if (typeof radius === "number") {
        radius = {tl: radius, tr: radius, br: radius, bl: radius};
    } else {
        const defaultRadius = {tl: 0, tr: 0, br: 0, bl: 0};
        for (let side in defaultRadius) {
            radius[side] = radius[side] || defaultRadius[side];
        }
    }

    context.beginPath();
    context.moveTo(x + radius.tl, y);
    context.lineTo(x + width - radius.tr, y);
    context.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
    context.lineTo(x + width, y + height - radius.br);
    context.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
    context.lineTo(x + radius.bl, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
    context.lineTo(x, y + radius.tl);
    context.quadraticCurveTo(x, y, x + radius.tl, y);
    context.closePath();

    if (fillColor) {
        context.fillStyle = fillColor;
        context.fill();
    }

    if (strokeColor) {
        context.strokeStyle = strokeColor;
        context.stroke()
    }
}

function drawTank(tank) {
    const {x, y, width, height, angle} = tank;
    ctx.save();
    ctx.translate(x + canvasShift.x, y + canvasShift.y);
    ctx.rotate(Math.PI / 180 * angle);
    ctx.beginPath();
    ctx.fillStyle = '#1063d0';
    ctx.fillRect(5 - (width / 2), 0 - (height / 2), 40, 40);
    ctx.fill();
    roundRect(ctx, 30 - (width / 2), 15 - (height / 2), 30, 10, {tl: 3, tr: 3, bl: 5, br: 5}, '#09f', '#9dbed5')

    // -- TRACKS --
    roundRect(ctx, 0 - (width / 2), 0 - (height / 2), 50, 10, 5, '#363636');
    roundRect(ctx, 0 - (width / 2), 30 - (height / 2), 50, 10, 5, '#363636');

    ctx.beginPath();
    ctx.fillStyle = '#676767';
    const track1Shift = userTank.tracksShift[0] % 10;
    const track2Shift = userTank.tracksShift[1] % 10;

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

function drawWalls() {
    ctxWalls.clearRect(0, 0, 800, 800);
    ctxWalls.save();
    ctxWalls.translate(canvasShift.x, canvasShift.y);
    walls.forEach(wall => {
        ctxWalls.fillStyle = wall.color;
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
    canvasWalls.style.transform=`translate(${canvasShift.x}px,${canvasShift.y}px)`
}

function draw() {
    ctx.clearRect(0, 0, 800, 800);
    drawTank(userTank)
}

function loop() {
    update();
    draw();
    setTimeout(() => {
        requestAnimationFrame(loop)
    }, 30)
}

function keyup_handler(event) {
    switchKey(event, false)
}

function keypress_handler(event) {
    switchKey(event, true)
}

function switchKey(e, value) {
    switch (e.keyCode) {
        case 87:
            keys.w = value;
            break;
        case 83:
            keys.s = value;
            break;
        case 65:
            keys.a = value;
            break;
        case 68:
            keys.d = value;
            break;
    }
}

