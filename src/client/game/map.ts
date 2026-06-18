import type { Wall, WaterField } from '../../shared/types';

export const createWalls = (maxGameWidth: number, maxGameHeight: number): Wall[] => [
  { x: 0, y: 0, width: maxGameWidth, height: 20, path: new Path2D() },
  { x: 0, y: maxGameHeight - 20, width: maxGameWidth, height: 20, path: new Path2D() },
  { x: maxGameWidth - 20, y: 0, width: 20, height: maxGameHeight, path: new Path2D() },
  { x: 0, y: 0, width: 20, height: maxGameHeight, path: new Path2D() },
  { x: 100, y: 0, width: 20, height: 300, path: new Path2D() },
  { x: 100, y: 300, width: 200, height: 30, path: new Path2D() },
  { x: 300, y: 300, width: 50, height: 300, path: new Path2D() },
];

export const createWaterFields = (): WaterField[] => [
  {
    getPath: () => {
      const path = new Path2D();
      path.moveTo(170, 80);
      path.bezierCurveTo(130, 100, 130, 150, 230, 150);
      path.bezierCurveTo(420, 150, 420, 120, 390, 100);
      path.bezierCurveTo(320, 5, 250, 20, 250, 50);
      return path;
    },
  },
  {
    getPath: () => {
      const path = new Path2D();
      path.moveTo(371, 292);
      path.quadraticCurveTo(400, 250, 480, 232);
      path.bezierCurveTo(554, 221, 529, 226, 578, 250);
      path.bezierCurveTo(590, 260, 546, 259, 569, 280);
      path.bezierCurveTo(572, 304, 561, 288, 587, 314);
      path.bezierCurveTo(594, 345, 569, 328, 588, 361);
      path.bezierCurveTo(586, 392, 562, 374, 583, 406);
      path.bezierCurveTo(583, 446, 564, 423, 590, 464);
      path.bezierCurveTo(593, 489, 588, 482, 596, 501);
      path.bezierCurveTo(575, 533, 562, 523, 543, 537);
      path.bezierCurveTo(519, 544, 502, 545, 505, 531);
      path.bezierCurveTo(490, 519, 473, 519, 498, 500);
      path.bezierCurveTo(503, 478, 482, 489, 519, 472);
      path.bezierCurveTo(530, 460, 512, 471, 538, 458);
      path.bezierCurveTo(546, 438, 525, 443, 539, 424);
      path.bezierCurveTo(536, 414, 514, 414, 525, 417);
      path.bezierCurveTo(503, 421, 492, 418, 494, 434);
      path.bezierCurveTo(468, 454, 452, 440, 462, 469);
      path.bezierCurveTo(451, 497, 436, 484, 465, 516);
      path.bezierCurveTo(472, 543, 442, 536, 484, 553);
      path.bezierCurveTo(511, 574, 480, 556, 535, 571);
      path.bezierCurveTo(552, 578, 533, 573, 559, 584);
      path.bezierCurveTo(562, 590, 538, 593, 548, 595);
      path.bezierCurveTo(507, 602, 506, 606, 487, 598);
      path.bezierCurveTo(464, 593, 452, 596, 460, 577);
      path.bezierCurveTo(443, 551, 432, 564, 445, 534);
      path.bezierCurveTo(438, 504, 421, 521, 440, 491);
      path.bezierCurveTo(438, 461, 412, 476, 440, 449);
      path.bezierCurveTo(446, 424, 422, 436, 459, 417);
      path.bezierCurveTo(471, 401, 448, 413, 482, 399);
      path.bezierCurveTo(496, 383, 467, 391, 499, 374);
      path.bezierCurveTo(510, 356, 485, 367, 515, 349);
      path.bezierCurveTo(526, 324, 502, 338, 529, 312);
      path.bezierCurveTo(534, 288, 517, 298, 532, 277);
      path.bezierCurveTo(529, 265, 508, 270, 517, 266);
      path.bezierCurveTo(502, 261, 489, 260, 495, 264);
      path.bezierCurveTo(480, 267, 464, 263, 476, 275);
      path.bezierCurveTo(461, 293, 455, 287, 462, 307);
      path.bezierCurveTo(448, 326, 434, 335, 438, 331);
      path.quadraticCurveTo(380, 324, 368, 291);
      return path;
    },
  },
];
