const keys = {
    w: false,
    s: false,
    a: false,
    d: false,
    shift: false,
    space: false,
}
const userTank = {
    uid: null,
    lives: 100,
    x: 60,
    y: 70,
    speed: 4,
    angle: 90,
    mod: 1,
    tracksShift: [0, 0],
    traces: [],
    width: 50,
    height: 40,
    color: [0, 153, 221],
    velocity: {
        x: 0,
        y: 0
    },
    friction: 0.90,
    force: 100
}

const TANKS = [];
const MINES = [];
let LAST_MINE_TIME = 0;

const wrapper = document.querySelector(".wrapper");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const canvasWalls = document.getElementById("canvas-walls");
const ctxWalls = canvasWalls.getContext("2d");
const maxGameWidth = 3300;
const maxGameHeight = 3200;
const canvasShift = {
    x: 0,
    y: 0
}
const PATTERNS = {
    BLOCK_1: new Image(),
    BLOCK_2: new Image(),
    WATER: new Image(),
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
    },
    {
        x: 300,
        y: 300,
        width: 50,
        height: 300,
        color: 'brown',
        path: new Path2D()
    }
]
const WATER_FIELDS = [
    {
        getPath: () => {
            const path = new Path2D();
            path.moveTo(170, 80);
            path.bezierCurveTo(130, 100, 130, 150, 230, 150);
            path.bezierCurveTo(420, 150, 420, 120, 390, 100);
            path.bezierCurveTo(320, 5, 250, 20, 250, 50);
            return path;
        }
    },
    {
        getPath: () => {
            const path = new Path2D();
            path.moveTo(106, 245);
            path.quadraticCurveTo(139, 183, 186, 180);
            path.bezierCurveTo(303, 244, 303, 256, 270, 275);
            path.bezierCurveTo(227, 298, 229, 304, 184, 320);
            path.bezierCurveTo(130, 338, 99, 361, 73, 342);
            path.bezierCurveTo(51, 326, 74, 290, 88, 251);
            path.quadraticCurveTo(90, 242, 106, 246);
            return path

        }
    },
    {
        getPath: () => {
            const path = new Path2D();
            path.moveTo(371, 292)
            path.quadraticCurveTo(400, 250, 480, 232);
            path.bezierCurveTo((524+30), 221, (519+10), 226, (548+30), 250);
            path.bezierCurveTo((560+30), 260, (536+10), 259, (539+30), 280);
            path.bezierCurveTo((542+30), 304, (551+10), 288, (557+30), 314);
            path.bezierCurveTo((564+30), 345, (559+10), 328, (558+30), 361);
            path.bezierCurveTo((556+30), 392, (552+10), 374, (553+30), 406);
            path.bezierCurveTo((553+30), 446, (554+10), 423, (560+30), 464);
            path.bezierCurveTo((563+30), 489, (578+10), 482, (566+30), 501);
            path.bezierCurveTo((545+30), 533, (552+10), 523, (513+30), 537);
            path.bezierCurveTo((489+30), 544, (492+10), 545, (475+30), 531);
            path.bezierCurveTo((460+30), 519, (463+10), 519, (468+30), 500);
            path.bezierCurveTo((473+30), 478, (472+10), 489, (489+30), 472);
            path.bezierCurveTo((500+30), 460, (502+10), 471, (508+30), 458);
            path.bezierCurveTo((516+30), 438, (515+10), 443, (509+30), 424);
            path.bezierCurveTo((506+30), 414, (504+10), 414, (495+30), 417);
            path.bezierCurveTo((473+30), 421, (482+10), 418, (464+30), 434);
            path.bezierCurveTo((438+30), 454, (442+10), 440, (432+30), 469);
            path.bezierCurveTo((421+30), 497, (426+10), 484, (435+30), 516);
            path.bezierCurveTo((442+30), 543, (432+10), 536, (454+30), 553);
            path.bezierCurveTo((481+30), 574, (470+10), 556, (505+30), 571);
            path.bezierCurveTo((522+30), 578, (523+10), 573, (529+30), 584);
            path.bezierCurveTo((532+30), 590, (528+10), 593, (518+30), 595);
            path.bezierCurveTo((477+30), 602, (496+10), 606, (457+30), 598);
            path.bezierCurveTo((434+30), 593, (442+10), 596, (430+30), 577);
            path.bezierCurveTo((413+30), 551, (422+10), 564, (415+30), 534);
            path.bezierCurveTo((408+30), 504, (411+10), 521, (410+30), 491);
            path.bezierCurveTo((408+30), 461, (402+10), 476, (410+30), 449);
            path.bezierCurveTo((416+30), 424, (412+10), 436, (429+30), 417);
            path.bezierCurveTo((441+30), 401, (438+10), 413, (452+30), 399);
            path.bezierCurveTo((466+30), 383, (457+10), 391, (469+30), 374);
            path.bezierCurveTo((480+30), 356, (475+10), 367, (485+30), 349);
            path.bezierCurveTo((496+30), 324, (492+10), 338, (499+30), 312);
            path.bezierCurveTo((504+30), 288, (507+10), 298, (502+30), 277);
            path.bezierCurveTo((499+30), 265, (498+10), 270, (487+30), 266);
            path.bezierCurveTo((472+30), 261, (479+10), 260, (465+30), 264);
            path.bezierCurveTo((450+30), 267, (454+10), 263, (446+30), 275);
            path.bezierCurveTo((431+30), 293, (445+10), 287, (432+30), 307);
            path.bezierCurveTo((418+30), 326, (424+10), 335, (408+30), 331);
            path.quadraticCurveTo(380, 324, 368, 291);
            return path

        }
    },
]

