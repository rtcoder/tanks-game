import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {vector} from './common/utils.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');
const mapPath = resolve(projectRoot, 'src/assets/maps/default.json');

const randomFactory = (seed) => {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
};

const addScaledVector2 = (position, rotationZ, offset) => [
  position[0] + -Math.sin(rotationZ) * offset,
  position[1] + Math.cos(rotationZ) * offset,
  position[2],
];

const createSegmentedWall = ({idPrefix, size, position, rotation, health, maxBlockLength}) => {
  const blockCount = Math.max(1, Math.ceil(size[1] / maxBlockLength));
  const blockLength = size[1] / blockCount;
  const firstOffset = -(size[1] - blockLength) / 2;
  const walls = [];

  for (let blockIndex = 0; blockIndex < blockCount; blockIndex++) {
    const blockPosition = addScaledVector2(position, rotation[2], firstOffset + blockIndex * blockLength);
    walls.push({
      id: `${idPrefix}-${blockIndex}`,
      kind: 'maze',
      size: vector([size[0], blockLength, size[2]]),
      position: vector(blockPosition),
      rotation: vector(rotation),
      destructible: true,
      health,
    });
  }

  return walls;
};

const generateMazeWalls = (mapData) => {
  const generator = mapData.maze ?? mapData.generator;
  const {gridSize: size, seed, wall} = generator;
  const marginSize = mapData.arena.size;
  const gridCount = size * size;
  const hasWall = Array.from({length: gridCount}, () => Array(gridCount).fill(false));

  for (let i = 0; i < gridCount; i++) {
    if (i % size !== 0) hasWall[i][i - 1] = true;
    if (i % size !== size - 1) hasWall[i][i + 1] = true;
    if (i >= size) hasWall[i][i - size] = true;
    if (i < gridCount - size) hasWall[i][i + size] = true;
  }

  const visited = Array(gridCount).fill(false);
  const stack = [];
  const random = randomFactory(seed);
  let current = 0;
  visited[current] = true;

  while (true) {
    const options = [];
    for (let i = 0; i < gridCount; i++) {
      if (hasWall[current][i] && !visited[i]) options.push(i);
    }
    if (options.length === 0) {
      const previous = stack.pop();
      if (previous === undefined) break;
      current = previous;
      continue;
    }

    const next = options[Math.floor(random() * options.length)];
    stack.push(current);
    visited[next] = true;
    hasWall[current][next] = false;
    hasWall[next][current] = false;
    current = next;
  }

  const gridCellSize = marginSize / size;
  const walls = [];
  for (let i = 0; i < gridCount; i++) {
    for (let j = i + 1; j < gridCount; j++) {
      if (!hasWall[i][j]) continue;

      const position = [0, 0, 0];
      const rotation = [0, 0, 0];
      if (j === i + 1) {
        position[0] = -marginSize / 2 + gridCellSize * (j % size);
        position[1] = marginSize / 2 - gridCellSize * (Math.floor(j / size) + 0.5);
      } else if (j === i + size) {
        position[0] = -marginSize / 2 + gridCellSize * (j % size + 0.5);
        position[1] = marginSize / 2 - gridCellSize * Math.floor(j / size);
        rotation[2] = Math.PI / 2;
      } else {
        continue;
      }

      walls.push(...createSegmentedWall({
        idPrefix: `maze-${i}-${j}`,
        size: [wall.thickness, gridCellSize + wall.lengthPadding, wall.height],
        position,
        rotation,
        health: wall.health,
        maxBlockLength: wall.maxBlockLength,
      }));
    }
  }

  return walls;
};

const mapData = JSON.parse(await readFile(mapPath, 'utf8'));
const generator = mapData.maze ?? mapData.generator;
const boundarySource = mapData.boundaryWalls ?? mapData.walls.filter((wall) => wall.kind === 'boundary');
const boundaryWalls = boundarySource.map((wall) => ({
  ...wall,
  kind: 'boundary',
}));
const walls = [
  ...generateMazeWalls(mapData),
  ...boundaryWalls,
];

const exportedMap = {
  id: mapData.id,
  name: mapData.name,
  arena: mapData.arena,
  generator: {
    type: 'depth-first-maze',
    gridSize: generator.gridSize,
    seed: generator.seed,
    wall: {
      ...generator.wall,
      maxBlockHeight: generator.wall.maxBlockHeight ?? 50,
    },
  },
  walls,
};

await writeFile(mapPath, `${JSON.stringify(exportedMap, null, 2)}\n`);
console.log(`Generated ${walls.length} walls into ${mapPath}`);
