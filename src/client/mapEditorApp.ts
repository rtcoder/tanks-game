import * as THREE from 'three';
import type { MapDefinition, TerrainPatch } from '../shared/types';
import {
  createDefaultMapDefinition,
  exportMapDefinition,
  listProjectMaps,
  sanitizeMapDefinition,
  TEXTURE_URLS,
} from './game/map';

const WORLD_SCALE = 0.12;

type EditorTool = 'building' | 'obstacle' | 'hill' | 'pit' | 'rough' | 'delete';

const projectMaps = listProjectMaps();
let mapDefinition: MapDefinition = structuredClone(projectMaps[0]?.definition ?? {
  ...createDefaultMapDefinition(),
  name: 'new-map',
  buildings: [],
});
let activeTool: EditorTool = 'building';
let cameraRotation = 0;
let cameraZoom = 1;
let selectedObjectId: string | null = null;

document.body.innerHTML = `
  <main class="editor-page">
    <aside class="editor-sidebar">
      <header>
        <p class="eyebrow">Map creator</p>
        <h1>Editor</h1>
      </header>
      <label class="field">
        <span>Project maps</span>
        <select id="editor-map-list"></select>
      </label>
      <label class="field">
        <span>Filename / map name</span>
        <input id="editor-map-name" type="text" value="${mapDefinition.name}">
      </label>
      <div class="battle-grid">
        <label class="field">
          <span>Width</span>
          <input id="editor-map-width" type="number" min="1000" max="50000" step="500" value="${mapDefinition.width}">
        </label>
        <label class="field">
          <span>Height</span>
          <input id="editor-map-height" type="number" min="1000" max="50000" step="500" value="${mapDefinition.height}">
        </label>
      </div>
      <label class="field">
        <span>Ground texture</span>
        <select id="editor-ground-texture">
          <option value="bt-grassy-meadow">bt-grassy-meadow</option>
          <option value="bt-patchy-meadow">bt-patchy-meadow</option>
          <option value="terrain-grass">terrain-grass</option>
          <option value="terrain-rough">terrain-rough</option>
        </select>
      </label>
      <div class="editor-tool-grid">
        <button data-tool="building" class="active">Building</button>
        <button data-tool="obstacle">Obstacle</button>
        <button data-tool="hill">Hill</button>
        <button data-tool="pit">Pit</button>
        <button data-tool="rough">Rough</button>
        <button data-tool="delete">Delete</button>
      </div>
      <div class="battle-grid">
        <label class="field">
          <span>Levels</span>
          <input id="editor-levels" type="number" min="1" max="8" value="1">
        </label>
        <label class="field">
          <span>Block size</span>
          <input id="editor-block-size" type="number" min="40" max="180" step="20" value="80">
        </label>
      </div>
      <div class="editor-actions">
        <button id="editor-rotate-left">Rotate left</button>
        <button id="editor-rotate-right">Rotate right</button>
        <button id="editor-export" class="primary">Export JSON</button>
        <a id="editor-back" href="/">Back to game</a>
      </div>
      <textarea id="editor-json-output" spellcheck="false"></textarea>
      <p id="editor-status">Click on the map to place. Mouse wheel zooms. Q/E rotates.</p>
    </aside>
    <section class="editor-viewport">
      <canvas id="editor-canvas"></canvas>
    </section>
  </main>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#editor-canvas');
const mapList = document.querySelector<HTMLSelectElement>('#editor-map-list');
const mapNameInput = document.querySelector<HTMLInputElement>('#editor-map-name');
const widthInput = document.querySelector<HTMLInputElement>('#editor-map-width');
const heightInput = document.querySelector<HTMLInputElement>('#editor-map-height');
const groundTextureSelect = document.querySelector<HTMLSelectElement>('#editor-ground-texture');
const levelsInput = document.querySelector<HTMLInputElement>('#editor-levels');
const blockSizeInput = document.querySelector<HTMLInputElement>('#editor-block-size');
const jsonOutput = document.querySelector<HTMLTextAreaElement>('#editor-json-output');
const statusText = document.querySelector<HTMLElement>('#editor-status');

if (
  !canvas
  || !mapList
  || !mapNameInput
  || !widthInput
  || !heightInput
  || !groundTextureSelect
  || !levelsInput
  || !blockSizeInput
  || !jsonOutput
  || !statusText
) {
  throw new Error('Editor UI is incomplete');
}

projectMaps.forEach(({ name }) => {
  const option = document.createElement('option');
  option.value = name;
  option.textContent = name;
  mapList.append(option);
});
mapList.value = mapDefinition.name;
groundTextureSelect.value = mapDefinition.groundTexture;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 4000);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const root = new THREE.Group();
const objectMeshes = new Map<string, THREE.Object3D>();
const textureLoader = new THREE.TextureLoader();
const textureCache = new Map<string, THREE.Texture>();

scene.background = new THREE.Color(0x070908);
scene.add(root);
scene.add(new THREE.HemisphereLight(0xe8f0d2, 0x1c2419, 1.8));
const sun = new THREE.DirectionalLight(0xffffff, 2.3);
sun.position.set(80, 160, 90);
scene.add(sun);

const setStatus = (message: string): void => {
  statusText.textContent = message;
};

const getTexture = (textureKey: string, repeatX = 1, repeatY = 1): THREE.Texture | null => {
  const url = TEXTURE_URLS[textureKey];
  if (!url) {
    return null;
  }
  const cacheKey = `${textureKey}:${repeatX}:${repeatY}`;
  const cached = textureCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const texture = textureLoader.load(url);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(Math.max(1, repeatX), Math.max(1, repeatY));
  texture.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(cacheKey, texture);
  return texture;
};

const worldToEditor = (x: number, y: number, height = 0): THREE.Vector3 => new THREE.Vector3(
  (x - mapDefinition.width / 2) * WORLD_SCALE,
  height,
  (y - mapDefinition.height / 2) * WORLD_SCALE,
);

const disposeObject = (object: THREE.Object3D): void => {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
};

const createMaterial = (
  textureKey: string,
  color: number,
  repeatX = 1,
  repeatY = 1,
): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({
  color,
  map: getTexture(textureKey, repeatX, repeatY) ?? undefined,
  roughness: 0.84,
});

const syncInputsFromMap = (): void => {
  mapNameInput.value = mapDefinition.name;
  widthInput.value = String(mapDefinition.width);
  heightInput.value = String(mapDefinition.height);
  groundTextureSelect.value = mapDefinition.groundTexture;
};

const updateJsonOutput = (): void => {
  jsonOutput.value = exportMapDefinition(mapDefinition);
};

const rebuildScene = (): void => {
  root.children.forEach(disposeObject);
  root.clear();
  objectMeshes.clear();

  const groundTexture = getTexture(
    mapDefinition.groundTexture,
    mapDefinition.width / 400,
    mapDefinition.height / 400,
  );
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(mapDefinition.width * WORLD_SCALE, mapDefinition.height * WORLD_SCALE),
    new THREE.MeshBasicMaterial({ color: 0x3a7a3e, map: groundTexture ?? undefined, side: THREE.DoubleSide }),
  );
  ground.name = 'ground';
  ground.rotation.x = -Math.PI / 2;
  root.add(ground);

  const grid = new THREE.GridHelper(
    Math.max(mapDefinition.width, mapDefinition.height) * WORLD_SCALE,
    Math.ceil(Math.max(mapDefinition.width, mapDefinition.height) / 500),
    0xa0bc72,
    0x356f38,
  );
  grid.position.y = 0.05;
  root.add(grid);

  mapDefinition.buildings.forEach((building) => {
    const material = createMaterial(building.texture, 0x6f6b58, building.columns, building.rows);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        building.columns * building.segmentSize * WORLD_SCALE,
        building.levels * 5.6,
        building.rows * building.segmentSize * WORLD_SCALE,
      ),
      material,
    );
    mesh.position.copy(worldToEditor(
      building.x + (building.columns * building.segmentSize) / 2,
      building.y + (building.rows * building.segmentSize) / 2,
      (building.levels * 5.6) / 2,
    ));
    root.add(mesh);
    objectMeshes.set(building.id, mesh);
  });

  mapDefinition.obstacles.forEach((obstacle) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(obstacle.width * WORLD_SCALE, obstacle.levels * 4.5, obstacle.height * WORLD_SCALE),
      createMaterial(obstacle.texture, 0x39403e, obstacle.width / 140, obstacle.height / 140),
    );
    mesh.position.copy(worldToEditor(
      obstacle.x + obstacle.width / 2,
      obstacle.y + obstacle.height / 2,
      (obstacle.levels * 4.5) / 2,
    ));
    root.add(mesh);
    objectMeshes.set(obstacle.id, mesh);
  });

  mapDefinition.terrainPatches.forEach((patch) => {
    const color = patch.kind === 'pit' ? 0x24502a : patch.kind === 'rough' ? 0x6b6a42 : 0x4f9147;
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(patch.radius * WORLD_SCALE, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.65, side: THREE.DoubleSide }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(worldToEditor(patch.x, patch.y, 0.18));
    root.add(mesh);
    objectMeshes.set(patch.id, mesh);
  });

  updateJsonOutput();
};

const resize = (): void => {
  const rect = canvas.parentElement?.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect?.width ?? window.innerWidth));
  const height = Math.max(1, Math.floor(rect?.height ?? window.innerHeight));
  renderer.setSize(width, height, false);
  const viewWidth = (mapDefinition.width * WORLD_SCALE) / cameraZoom;
  const viewHeight = viewWidth / (width / height);
  camera.left = -viewWidth / 2;
  camera.right = viewWidth / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.position.set(Math.sin(cameraRotation) * 900, 900, Math.cos(cameraRotation) * 900);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
};

const getPointerWorld = (event: MouseEvent): { x: number; y: number } | null => {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const ground = root.getObjectByName('ground');
  if (!ground) {
    return null;
  }
  const hit = raycaster.intersectObject(ground)[0];
  if (!hit) {
    return null;
  }
  return {
    x: hit.point.x / WORLD_SCALE + mapDefinition.width / 2,
    y: hit.point.z / WORLD_SCALE + mapDefinition.height / 2,
  };
};

const createId = (prefix: string): string => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

const placeAt = (x: number, y: number): void => {
  const snappedX = Math.round(x / 40) * 40;
  const snappedY = Math.round(y / 40) * 40;
  const levels = Math.max(1, Math.min(8, Number(levelsInput.value) || 1));
  const blockSize = Math.max(40, Math.min(180, Number(blockSizeInput.value) || 80));

  if (activeTool === 'delete') {
    deleteNearest(snappedX, snappedY);
  } else if (activeTool === 'building') {
    const columns = 5;
    const rows = 4;
    mapDefinition.buildings.push({
      id: createId('building'),
      x: snappedX - (columns * blockSize) / 2,
      y: snappedY - (rows * blockSize) / 2,
      columns,
      rows,
      segmentSize: blockSize,
      levels,
      texture: 'building-concrete',
    });
    setStatus('Building placed.');
  } else if (activeTool === 'obstacle') {
    mapDefinition.obstacles.push({
      id: createId('obstacle'),
      x: snappedX - 180,
      y: snappedY - 50,
      width: 360,
      height: 100,
      levels,
      texture: 'obstacle-metal',
    });
    setStatus('Obstacle placed.');
  } else {
    mapDefinition.terrainPatches.push({
      id: createId('terrain'),
      x: snappedX,
      y: snappedY,
      radius: activeTool === 'rough' ? 300 : 220,
      kind: activeTool as TerrainPatch['kind'],
    });
    setStatus(`${activeTool} terrain placed.`);
  }
  rebuildScene();
};

function deleteNearest(x: number, y: number): void {
  const candidates = [
    ...mapDefinition.buildings.map((item) => ({
      id: item.id,
      distance: Math.hypot(x - (item.x + item.columns * item.segmentSize / 2), y - (item.y + item.rows * item.segmentSize / 2)),
      remove: () => {
        mapDefinition.buildings = mapDefinition.buildings.filter((building) => building.id !== item.id);
      },
    })),
    ...mapDefinition.obstacles.map((item) => ({
      id: item.id,
      distance: Math.hypot(x - (item.x + item.width / 2), y - (item.y + item.height / 2)),
      remove: () => {
        mapDefinition.obstacles = mapDefinition.obstacles.filter((obstacle) => obstacle.id !== item.id);
      },
    })),
    ...mapDefinition.terrainPatches.map((item) => ({
      id: item.id,
      distance: Math.hypot(x - item.x, y - item.y),
      remove: () => {
        mapDefinition.terrainPatches = mapDefinition.terrainPatches.filter((patch) => patch.id !== item.id);
      },
    })),
  ].sort((a, b) => a.distance - b.distance);

  const nearest = candidates[0];
  if (nearest && nearest.distance < 420) {
    nearest.remove();
    selectedObjectId = null;
    setStatus(`Deleted ${nearest.id}.`);
    rebuildScene();
  } else {
    setStatus('Nothing close enough to delete.');
  }
}

const updateToolButtons = (): void => {
  document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => {
    button.classList.toggle('active', button.dataset.tool === activeTool);
  });
};

document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => {
  button.addEventListener('click', () => {
    const tool = button.dataset.tool;
    if (tool === 'building' || tool === 'obstacle' || tool === 'hill' || tool === 'pit' || tool === 'rough' || tool === 'delete') {
      activeTool = tool;
      updateToolButtons();
      setStatus(`${tool} selected.`);
    }
  });
});

mapList.addEventListener('change', () => {
  const selected = projectMaps.find((map) => map.name === mapList.value);
  if (!selected) {
    return;
  }
  mapDefinition = structuredClone(selected.definition);
  syncInputsFromMap();
  rebuildScene();
  resize();
  setStatus(`Loaded ${selected.name}.`);
});

[mapNameInput, widthInput, heightInput, groundTextureSelect].forEach((input) => {
  input.addEventListener('change', () => {
    mapDefinition = sanitizeMapDefinition({
      ...mapDefinition,
      name: mapNameInput.value.trim() || 'new-map',
      width: Number(widthInput.value),
      height: Number(heightInput.value),
      groundTexture: groundTextureSelect.value,
    });
    syncInputsFromMap();
    rebuildScene();
    resize();
  });
});

canvas.addEventListener('click', (event) => {
  const point = getPointerWorld(event);
  if (!point) {
    return;
  }
  placeAt(point.x, point.y);
});

canvas.addEventListener('mousemove', (event) => {
  const point = getPointerWorld(event);
  if (!point) {
    return;
  }
  selectedObjectId = `x ${Math.round(point.x)} / y ${Math.round(point.y)}`;
  setStatus(`${selectedObjectId}. Click to place ${activeTool}.`);
});

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  cameraZoom = THREE.MathUtils.clamp(cameraZoom * (event.deltaY > 0 ? 0.9 : 1.1), 0.25, 5);
  resize();
}, { passive: false });

document.querySelector<HTMLButtonElement>('#editor-rotate-left')?.addEventListener('click', () => {
  cameraRotation -= Math.PI / 12;
  resize();
});

document.querySelector<HTMLButtonElement>('#editor-rotate-right')?.addEventListener('click', () => {
  cameraRotation += Math.PI / 12;
  resize();
});

document.querySelector<HTMLButtonElement>('#editor-export')?.addEventListener('click', () => {
  const content = exportMapDefinition(mapDefinition);
  jsonOutput.value = content;
  const blob = new Blob([content], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${mapDefinition.name || 'new-map'}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  setStatus(`Exported ${link.download}. Put it in src/maps to make it a project map.`);
});

window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyQ') {
    cameraRotation -= Math.PI / 18;
    resize();
  }
  if (event.code === 'KeyE') {
    cameraRotation += Math.PI / 18;
    resize();
  }
});

window.addEventListener('resize', resize);

const animate = (): void => {
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
};

syncInputsFromMap();
rebuildScene();
resize();
animate();
