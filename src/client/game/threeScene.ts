import * as THREE from 'three';
import type { Mine, Tank, Wall, WaterField } from '../../shared/types';
import { MINE_ARM_MS } from './constants';
import { isMineArmed } from './collisions';

const WORLD_SCALE = 0.035;
const WALL_HEIGHT = 2.2;
const GROUND_Y = 0;
const TANK_Y = 0.75;
const CAMERA_DISTANCE = 32;
const CAMERA_HEIGHT = 24;

type Bounds = {
  width: number;
  height: number;
};

type ThreeBattleSceneOptions = {
  canvas: HTMLCanvasElement;
  getBounds: () => Bounds;
  walls: Wall[];
  waterFields: WaterField[];
};

type RenderState = {
  userTank: Tank;
  remoteTanks: Tank[];
  mines: Mine[];
};

type TankMesh = {
  group: THREE.Group;
  hpFill: THREE.Mesh;
  accent: THREE.MeshStandardMaterial;
};

const toRadians = (angle: number): number => THREE.MathUtils.degToRad(angle);

export const worldToThreePosition = (
  point: { x: number; y: number },
  bounds: Bounds,
  height = GROUND_Y,
): THREE.Vector3 => new THREE.Vector3(
  (point.x - bounds.width / 2) * WORLD_SCALE,
  height,
  (point.y - bounds.height / 2) * WORLD_SCALE,
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

const clearGroup = (group: THREE.Group): void => {
  group.children.forEach(disposeObject);
  group.clear();
};

const createBox = (
  size: [number, number, number],
  color: number,
  position: [number, number, number],
): THREE.Mesh => {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.08 }),
  );
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

const createTankGroup = (color: string): TankMesh => {
  const group = new THREE.Group();
  const accent = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.12 });

  const leftTrack = createBox([2.35, 0.38, 0.32], 0x20251f, [0, 0.28, -0.62]);
  const rightTrack = createBox([2.35, 0.38, 0.32], 0x20251f, [0, 0.28, 0.62]);
  const body = createBox([2.05, 0.55, 1.08], 0x6e7550, [0, 0.68, 0]);
  const nose = createBox([0.86, 0.42, 0.82], 0x838a60, [0.42, 0.96, 0]);
  const turret = new THREE.Mesh(
    new THREE.CylinderGeometry(0.44, 0.52, 0.36, 18),
    new THREE.MeshStandardMaterial({ color: 0x8c9265, roughness: 0.72, metalness: 0.08 }),
  );
  turret.position.set(0.18, 1.23, 0);
  turret.castShadow = true;
  turret.receiveShadow = true;

  const barrel = createBox([1.32, 0.14, 0.14], 0xb8b08b, [1.05, 1.25, 0]);
  const muzzle = createBox([0.18, 0.18, 0.18], 0x595641, [1.78, 1.25, 0]);
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.64), accent);
  flag.position.set(-0.7, 1.02, 0);
  flag.castShadow = true;

  const hpBack = createBox([1.8, 0.08, 0.16], 0x1e261d, [0, 1.85, 0]);
  const hpFill = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.1, 0.18),
    new THREE.MeshBasicMaterial({ color: 0x95c85a }),
  );
  hpFill.position.set(0, 1.91, 0);

  group.add(leftTrack, rightTrack, body, nose, turret, barrel, muzzle, flag, hpBack, hpFill);
  return { group, hpFill, accent };
};

const createMineMesh = (): THREE.Mesh => {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.44, 0.18, 18),
    new THREE.MeshStandardMaterial({ color: 0x196b2f, roughness: 0.5, metalness: 0.18 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

const updateMineMaterial = (mesh: THREE.Mesh, mine: Mine): void => {
  const color = isMineArmed(mine, MINE_ARM_MS) ? 0x8c1515 : 0x1d8b3f;
  const material = mesh.material;
  if (material instanceof THREE.MeshStandardMaterial) {
    material.color.setHex(color);
  }
};

export const createThreeBattleScene = ({
  canvas,
  getBounds,
  walls,
}: ThreeBattleSceneOptions) => {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, canvas.width / canvas.height, 0.1, 500);
  const staticGroup = new THREE.Group();
  const wallsGroup = new THREE.Group();
  const waterGroup = new THREE.Group();
  const tanksGroup = new THREE.Group();
  const minesGroup = new THREE.Group();
  const tankMeshes = new Map<string, TankMesh>();
  const mineMeshes = new Map<string, THREE.Mesh>();
  let hasCameraSynced = false;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvas.width, canvas.height, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene.background = new THREE.Color(0x050806);
  scene.add(staticGroup, wallsGroup, waterGroup, tanksGroup, minesGroup);

  const hemi = new THREE.HemisphereLight(0xe8f0d2, 0x1c2419, 1.7);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(-28, 48, 24);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun);

  const rebuildStatic = (): void => {
    clearGroup(staticGroup);
    clearGroup(wallsGroup);
    clearGroup(waterGroup);

    const bounds = getBounds();
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(bounds.width * WORLD_SCALE, bounds.height * WORLD_SCALE),
      new THREE.MeshStandardMaterial({ color: 0x2f6532, roughness: 0.92 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    staticGroup.add(ground);

    const grid = new THREE.GridHelper(
      Math.max(bounds.width, bounds.height) * WORLD_SCALE,
      Math.ceil(Math.max(bounds.width, bounds.height) / 200),
      0x6c8e58,
      0x3f7440,
    );
    grid.material.transparent = true;
    grid.material.opacity = 0.35;
    grid.position.y = 0.03;
    staticGroup.add(grid);

    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x263425, roughness: 0.86 });
    const capMaterial = new THREE.MeshStandardMaterial({ color: 0x544345, roughness: 0.9 });
    walls.forEach((wall) => {
      const position = worldToThreePosition(
        { x: wall.x + wall.width / 2, y: wall.y + wall.height / 2 },
        bounds,
        WALL_HEIGHT / 2,
      );
      const wallMesh = new THREE.Mesh(
        new THREE.BoxGeometry(wall.width * WORLD_SCALE, WALL_HEIGHT, wall.height * WORLD_SCALE),
        wallMaterial,
      );
      wallMesh.position.copy(position);
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      wallsGroup.add(wallMesh);

      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(wall.width * WORLD_SCALE, 0.12, wall.height * WORLD_SCALE),
        capMaterial,
      );
      cap.position.copy(position);
      cap.position.y = WALL_HEIGHT + 0.07;
      cap.receiveShadow = true;
      wallsGroup.add(cap);
    });

    [
      { x: 280, y: 100, rx: 150, ry: 72 },
      { x: 504, y: 412, rx: 118, ry: 184 },
      { x: 476, y: 408, rx: 70, ry: 36 },
    ].forEach((water) => {
      const mesh = new THREE.Mesh(
        new THREE.CircleGeometry(1, 64),
        new THREE.MeshStandardMaterial({
          color: 0x26bfd0,
          transparent: true,
          opacity: 0.72,
          roughness: 0.38,
          metalness: 0.05,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.scale.set(water.rx * WORLD_SCALE, water.ry * WORLD_SCALE, 1);
      mesh.position.copy(worldToThreePosition(water, bounds, 0.05));
      waterGroup.add(mesh);
    });
  };

  const syncTank = (tank: Tank, isUser: boolean): void => {
    const id = tank.uid ?? (isUser ? 'user' : `${tank.x}:${tank.y}`);
    let tankMesh = tankMeshes.get(id);
    if (!tankMesh) {
      tankMesh = createTankGroup(tank.color);
      tankMeshes.set(id, tankMesh);
      tanksGroup.add(tankMesh.group);
    }

    tankMesh.accent.color.set(tank.color);
    tankMesh.group.position.copy(worldToThreePosition(tank, getBounds(), TANK_Y));
    tankMesh.group.rotation.y = -toRadians(tank.angle);
    tankMesh.hpFill.scale.x = Math.max(0.01, tank.lives / 100);
    tankMesh.hpFill.position.x = -0.85 + (1.7 * tank.lives / 100) / 2;
  };

  const syncTanks = (userTank: Tank, remoteTanks: Tank[]): void => {
    const activeIds = new Set<string>([userTank.uid ?? 'user']);
    syncTank(userTank, true);
    remoteTanks.forEach((tank) => {
      const id = tank.uid ?? `${tank.x}:${tank.y}`;
      activeIds.add(id);
      syncTank(tank, false);
    });
    tankMeshes.forEach((tankMesh, id) => {
      if (activeIds.has(id)) {
        return;
      }
      disposeObject(tankMesh.group);
      tanksGroup.remove(tankMesh.group);
      tankMeshes.delete(id);
    });
  };

  const syncMines = (mines: Mine[]): void => {
    const bounds = getBounds();
    const activeIds = new Set<string>();
    mines.forEach((mine) => {
      const id = `${mine.ownerUid ?? 'mine'}:${mine.time}:${mine.x}:${mine.y}`;
      activeIds.add(id);
      let mesh = mineMeshes.get(id);
      if (!mesh) {
        mesh = createMineMesh();
        mineMeshes.set(id, mesh);
        minesGroup.add(mesh);
      }
      mesh.position.copy(worldToThreePosition(mine, bounds, 0.18));
      updateMineMaterial(mesh, mine);
    });
    mineMeshes.forEach((mesh, id) => {
      if (activeIds.has(id)) {
        return;
      }
      disposeObject(mesh);
      minesGroup.remove(mesh);
      mineMeshes.delete(id);
    });
  };

  const syncCamera = (tank: Tank): void => {
    const bounds = getBounds();
    const target = worldToThreePosition(tank, bounds, 1.05);
    const angle = toRadians(tank.angle);
    const cameraTarget = new THREE.Vector3(
      target.x - Math.cos(angle) * CAMERA_DISTANCE,
      CAMERA_HEIGHT,
      target.z - Math.sin(angle) * CAMERA_DISTANCE,
    );
    if (hasCameraSynced) {
      camera.position.lerp(cameraTarget, 0.2);
    } else {
      camera.position.copy(cameraTarget);
      hasCameraSynced = true;
    }
    camera.lookAt(target);
  };

  const resize = (): void => {
    renderer.setSize(canvas.width, canvas.height, false);
    camera.aspect = canvas.width / canvas.height;
    camera.updateProjectionMatrix();
  };

  const render = ({ userTank, remoteTanks, mines }: RenderState): void => {
    syncTanks(userTank, remoteTanks);
    syncMines(mines);
    syncCamera(userTank);
    renderer.render(scene, camera);
  };

  rebuildStatic();

  return {
    rebuildStatic,
    render,
    resize,
  };
};
