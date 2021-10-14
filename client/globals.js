const keys = {
    w: false,
    s: false,
    a: false,
    d: false,
}
const userTank = {
    uid: null,
    x: 60,
    y: 70,
    speed: 4,
    angle: 90,
    mod: 1,
    tracksShift: [0, 0],
    width: 50,
    height: 40,
    color: [0, 153, 221],
    velocity: {
        x: 0,
        y: 0
    }
}

const TANKS = [
    {
        x: 180,
        y: 90,
        speed: 4,
        angle: 32,
        mod: 1,
        tracksShift: [0, 0],
        width: 50,
        height: 40,
        color: [186, 22, 22]
    },
    {
        x: 480,
        y: 290,
        speed: 4,
        angle: 32,
        mod: 1,
        tracksShift: [0, 0],
        width: 50,
        height: 40,
        color: [103, 157, 40]
    },
    {
        x: 500,
        y: 600,
        speed: 4,
        angle: 32,
        mod: 1,
        tracksShift: [0, 0],
        width: 50,
        height: 40,
        color: [189, 216, 42]
    },
]

const wrapper = document.querySelector(".wrapper");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const canvasWalls = document.getElementById("canvas-walls");
const ctxWalls = canvasWalls.getContext("2d");
const maxGameWidth = 1300;
const maxGameHeight = 1200;
const canvasShift = {
    x: 0,
    y: 0
}
const PATTERNS = {
    BLOCK_1: new Image(),
    BLOCK_2: new Image()
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

