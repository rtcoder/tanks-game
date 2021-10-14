function round(num, decimalPlaces = 0) {
    const value = 10 ** decimalPlaces;
    return Math.round((num + Number.EPSILON) * value) / value;
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
        case 16:
            keys.shift = value;
            break;
    }
}

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
    wrapper.style.transform = 'scale(' + scale + ') translate(-50%,-50%)'
}


function shift_color([r, g, b], val, percent) {
    return '#' +
        ((0 | (1 << 8) + r + (val - r) * percent / 100).toString(16)).substr(1) +
        ((0 | (1 << 8) + g + (val - g) * percent / 100).toString(16)).substr(1) +
        ((0 | (1 << 8) + b + (val - b) * percent / 100).toString(16)).substr(1);
}

function lighter_color([r, g, b], percent) {
    return shift_color([r, g, b], 256, percent);
}

function darker_color([r, g, b], percent) {
    return shift_color([r, g, b], 1, percent);
}
