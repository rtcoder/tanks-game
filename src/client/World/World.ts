import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MTLLoader} from 'three/examples/jsm/loaders/MTLLoader.js';
import {OBJLoader} from 'three/examples/jsm/loaders/OBJLoader.js';
import {normalizeGroundfireMap} from '../../shared/map-normalizer';
import type {
  BattleSummary,
  ClientMessage,
  GameConfig,
  GroundfireMap,
  GroundfireMapSummary,
  GroundfireWaterGameplay,
  GroundfireWaterSource,
  Tank as NetworkTank,
  WsMessage,
} from '../../shared/types';
import {BattleStatus, ClientMessageType, WsMessageType} from '../../shared/types';
import {Bullet, type BulletImpact} from './object/impl/Bullet';
import {Ground, type TerrainData} from './object/impl/Ground';
import {DirectionalLight} from './object/impl/Light/DirectionalLight';
import {HemiSphereLight} from './object/impl/Light/HemiSphereLight';
import {SkyDome} from './object/impl/Light/SkyDome';
import {AttackPowerup} from './object/impl/Powerups/AttackPowerup';
import {DefensePowerup} from './object/impl/Powerups/DefensePowerup';
import {GoalPowerup} from './object/impl/powerups/GoalPowerup';
import {HealthPowerup} from './object/impl/powerups/HealthPowerup';
import {DestructibleModel, type DestructibleModelHit} from './object/impl/DestructibleModel';
import {PenetrationPowerup} from './object/impl/Powerups/PenetrationPowerup';
import {Powerup} from './object/impl/Powerups/Powerup';
import {SpeedPowerup} from './object/impl/Powerups/SpeedPowerup';
import {WeaponPowerup} from './object/impl/Powerups/WeaponPowerup';
import {Tank} from './object/impl/Tank';
import {TankModel} from './object/impl/TankModel';
import {Wall} from './object/impl/Wall';
import {ThirdPersonViewCamera} from './system/Camera/ThirdPersonViewCamera';
import {Loop} from './system/Loop';
import {Renderer} from './system/Renderer';
import {Scene} from './system/Scene';
import {DEFAULT_TANK_ID, getTankDefinition, TANK_DEFINITIONS} from './tank-definitions/tank-definitions';
import {type TankDefinition} from './tank-definitions/shared/tank-definition.type';
import {detectRuntimeAcceleration, type RuntimeAccelerationProfile} from './performance/acceleration';

const DEFAULT_ARENA_SIZE = 1500;
const DEFAULT_MAP_ID = 'default';
const MAP_BLOCK_HEIGHT = 50;
const STRUCTURAL_GRAVITY = 620;
const STRUCTURAL_MAX_FALL_SPEED = 900;
const STRUCTURAL_DETACH_EPSILON = 2;
const STRUCTURAL_SUPPORT_EPSILON = 3;
const STRUCTURAL_MIN_SUPPORT_RATIO = 0.08;
const STRUCTURAL_MIN_SUPPORT_AREA = 16;
const STRUCTURAL_IMPACT_FREE_DISTANCE = 6;
const STRUCTURAL_IMPACT_DAMAGE_PER_UNIT = 0.35;
const WATER_GRID_SIZE = 80;
const MINIMAP_WORLD_VIEW_SIZE = 1500;
const MINIMAP_EDGE_INSET = 10;
const COMPASS_VISIBLE_DEGREES = 100;
const DEFAULT_WATER_GAMEPLAY: GroundfireWaterGameplay = {
  blocksMovement: false,
  speedMultiplier: 0.45,
  depthBlockThreshold: 28,
  projectileImpact: 'splash',
  explosionMultiplier: 0.35,
};
const STORAGE_KEYS = {
  nick: 'tanks:nick',
  battleId: 'tanks:battle-id',
  playerId: 'tanks:player-id',
  tankModelId: 'tanks:tank-model-id',
  mapId: 'tanks:map-id',
};

type KeyboardState = Record<string, number>;

type WaterCell = {
  key: string;
  column: number;
  row: number;
  x: number;
  y: number;
  size: number;
  level: number;
  depth: number;
  sourceId: string;
  gameplay: GroundfireWaterGameplay;
};

type WaterProjectileHit = {
  position: THREE.Vector3;
  cell: WaterCell;
};

const encodeMessage = (message: ClientMessage): string => JSON.stringify(message);
const decodeMessage = (message: string): WsMessage => JSON.parse(message) as WsMessage;

const createNetworkTank = (tank: Tank, uid: string | null, arenaHalf: number, color = '#8ca36f'): NetworkTank => ({
  uid,
  tankModelId: tank.tankModelId,
  turretAngle: THREE.MathUtils.radToDeg(tank.mesh.rotation.z + tank.aimYaw),
  lives: Math.max(0, tank.health),
  x: tank.mesh.position.x + arenaHalf,
  y: -tank.mesh.position.y + arenaHalf,
  speed: 7,
  angle: THREE.MathUtils.radToDeg(tank.mesh.rotation.z),
  mod: tank.proceed > 0 ? 1 : tank.proceed < 0 ? -1 : 0,
  tracksShift: [0, 0],
  traces: [],
  width: 50,
  height: 40,
  color,
  velocity: {x: 0, y: 0},
  friction: 0.9,
  force: 100,
});

const applyNetworkTank = (tank: Tank, data: NetworkTank, arenaHalf: number): void => {
  tank.mesh.position.set(data.x - arenaHalf, -(data.y - arenaHalf), 0);
  tank.mesh.rotation.z = THREE.MathUtils.degToRad(data.angle);
  tank.setAimYaw(THREE.MathUtils.degToRad(data.turretAngle ?? data.angle) - tank.mesh.rotation.z);
  tank.health = data.lives;
};

const sanitizeNick = (value: string): string => value.trim().slice(0, 24) || 'Player';

class World {
  status = 'menu';
  scene!: Scene;
  ground!: Ground;
  hemiLight!: HemiSphereLight;
  directLight!: DirectionalLight;
  skyDome!: SkyDome;
  walls: Wall[] = [];
  surrounding_walls: Wall[] = [];
  destructibleModels: DestructibleModel[] = [];
  powerups: Powerup[] = [];
  tanks: Tank[] = [];
  remoteTanks = new Map<string, Tank>();
  bullets: Bullet[] = [];
  destroyedWallIds = new Set<string>();
  destroyedModelChunkIds = new Set<string>();
  occludedWallIds = new Set<string>();
  sceneContainer: HTMLElement;
  menu: HTMLElement;
  replay: HTMLElement;
  instructions: HTMLElement;
  statusText: HTMLElement;
  nickInput: HTMLInputElement;
  mapSelectInput: HTMLSelectElement;
  battleTitleInput: HTMLInputElement;
  maxPlayersInput: HTMLInputElement;
  battleIdInput: HTMLInputElement;
  controlsButton: HTMLButtonElement;
  controlsModal: HTMLElement;
  controlsModalCloseButton: HTMLButtonElement;
  tankSelectionElement: HTMLElement;
  tankSelectButton: HTMLButtonElement;
  selectedTankNameElement: HTMLElement;
  selectedTankRoleElement: HTMLElement;
  tankModal: HTMLElement;
  tankModalCloseButton: HTMLButtonElement;
  tankModalConfirmButton: HTMLButtonElement;
  tankPreviewElement: HTMLElement;
  tankPreviewNameElement: HTMLElement;
  tankPreviewRoleElement: HTMLElement;
  tankPreviewDescriptionElement: HTMLElement;
  createButton: HTMLButtonElement;
  joinButton: HTMLButtonElement;
  healthContainer: HTMLElement;
  headingCompassCanvas: HTMLCanvasElement;
  headingCompassContext: CanvasRenderingContext2D | null;
  minimapCanvas: HTMLCanvasElement;
  minimapContext: CanvasRenderingContext2D | null;
  playerWinBanner: HTMLElement;
  playerLoseBanner: HTMLElement;
  keyboard: KeyboardState = {};
  camera!: ThirdPersonViewCamera;
  renderer!: Renderer;
  loop!: Loop;
  meshDict: { [key: string]: THREE.Object3D } = {};
  audioDict: { [key: string]: AudioBuffer } = {};
  textureDict: { [key: string]: { [key: string]: THREE.Texture } } = {};
  availableMaps: GroundfireMapSummary[] = [];
  selectedMapId = localStorage.getItem(STORAGE_KEYS.mapId) || DEFAULT_MAP_ID;
  mapData: GroundfireMap = normalizeGroundfireMap({
    id: DEFAULT_MAP_ID,
    name: 'Default Arena',
    arena: {size: DEFAULT_ARENA_SIZE},
    terrain: {resolution: 128, features: []},
  });
  mapTerrain: TerrainData = {resolution: 128, features: []};
  arenaSize = DEFAULT_ARENA_SIZE;
  arenaHalf = DEFAULT_ARENA_SIZE / 2;
  waterMeshes: THREE.Mesh[] = [];
  waterCells: WaterCell[] = [];
  waterCellLookup = new Map<string, WaterCell>();
  waterMinimapCells: Array<{ x: number; y: number; size: number }> = [];
  waterFlowAccumulator = 0;
  waterRebuildPending = false;
  listeners: THREE.AudioListener[] = [];
  bgAudio: THREE.Audio | null = null;
  localTank: Tank | null = null;
  webSocket: WebSocket | null = null;
  webSocketPath = '/ws';
  currentBattle: BattleSummary | null = null;
  playerId = localStorage.getItem(STORAGE_KEYS.playerId) || crypto.randomUUID();
  selectedTankId = getTankDefinition(localStorage.getItem(STORAGE_KEYS.tankModelId)).id;
  modalTankId = this.selectedTankId;
  selectedTankCountry = 'all';
  tankCountryFilterOpen = false;
  tankPreviewRenderer: THREE.WebGLRenderer | null = null;
  tankPreviewScene: THREE.Scene | null = null;
  tankPreviewCamera: THREE.PerspectiveCamera | null = null;
  tankPreviewModel: TankModel | null = null;
  tankPreviewRoot: THREE.Group | null = null;
  accelerationProfile: RuntimeAccelerationProfile = detectRuntimeAcceleration();
  lastSentAt = 0;
  lastSentSnapshot = '';

  constructor() {
    localStorage.setItem(STORAGE_KEYS.playerId, this.playerId);
    this.sceneContainer = document.getElementById('scene-container') as HTMLElement;
    this.menu = document.getElementById('menu') as HTMLElement;
    this.replay = document.getElementById('replayMessage') as HTMLElement;
    this.instructions = document.getElementById('instructions') as HTMLElement;
    this.statusText = document.getElementById('battle-status-text') as HTMLElement;
    this.nickInput = document.getElementById('nick-input') as HTMLInputElement;
    this.mapSelectInput = document.getElementById('map-select-input') as HTMLSelectElement;
    this.battleTitleInput = document.getElementById('battle-title-input') as HTMLInputElement;
    this.maxPlayersInput = document.getElementById('max-players-input') as HTMLInputElement;
    this.battleIdInput = document.getElementById('battle-id-input') as HTMLInputElement;
    this.controlsButton = document.getElementById('controls-button') as HTMLButtonElement;
    this.controlsModal = document.getElementById('controls-modal') as HTMLElement;
    this.controlsModalCloseButton = document.getElementById('controls-modal-close') as HTMLButtonElement;
    this.tankSelectionElement = document.getElementById('tank-selection') as HTMLElement;
    this.tankSelectButton = document.getElementById('tank-select-button') as HTMLButtonElement;
    this.selectedTankNameElement = document.getElementById('selected-tank-name') as HTMLElement;
    this.selectedTankRoleElement = document.getElementById('selected-tank-role') as HTMLElement;
    this.tankModal = document.getElementById('tank-modal') as HTMLElement;
    this.tankModalCloseButton = document.getElementById('tank-modal-close') as HTMLButtonElement;
    this.tankModalConfirmButton = document.getElementById('tank-modal-confirm') as HTMLButtonElement;
    this.tankPreviewElement = document.getElementById('tank-preview') as HTMLElement;
    this.tankPreviewNameElement = document.getElementById('tank-preview-name') as HTMLElement;
    this.tankPreviewRoleElement = document.getElementById('tank-preview-role') as HTMLElement;
    this.tankPreviewDescriptionElement = document.getElementById('tank-preview-description') as HTMLElement;
    this.createButton = document.getElementById('create-battle-button') as HTMLButtonElement;
    this.joinButton = document.getElementById('join-battle-button') as HTMLButtonElement;
    this.healthContainer = document.getElementById('player1-container') as HTMLElement;
    this.headingCompassCanvas = document.getElementById('heading-compass-canvas') as HTMLCanvasElement;
    this.headingCompassContext = this.headingCompassCanvas.getContext('2d');
    this.minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    this.minimapContext = this.minimapCanvas.getContext('2d');
    this.playerWinBanner = document.getElementById('player1-win-banner') as HTMLElement;
    this.playerLoseBanner = document.getElementById('player1-lose-banner') as HTMLElement;
    this.init();
  }

  async init(): Promise<void> {
    this.nickInput.value = localStorage.getItem(STORAGE_KEYS.nick) || '';
    this.battleIdInput.value = localStorage.getItem(STORAGE_KEYS.battleId) || '';
    this.renderTankSelection();
    await this.loadGameConfig();
    await this.loadMaps();
    await this.loadMapById(this.selectedMapId);
    await this.loadAssets();
    console.info('Groundfire acceleration profile', this.accelerationProfile);
    this.scene = new Scene();
    this.skyDome = new SkyDome('main');
    this.scene.add(this.skyDome);
    this.ground = new Ground('main', this.textureDict['ground'], this.arenaSize, this.mapTerrain);
    this.scene.add(this.ground);
    this.hemiLight = new HemiSphereLight('main');
    this.directLight = new DirectionalLight('main');
    this.scene.add(this.hemiLight);
    this.scene.add(this.directLight);
    this.initializeWalls(this.walls, this.surrounding_walls);
    this.walls.forEach((wall) => this.scene.add(wall));
    await this.initializeDestructibleModels();
    this.initializeWater();
    this.localTank = this.createPlayerTank('local');
    this.localTank.post_init(this.healthContainer);
    this.scene.add(this.localTank);
    this.tanks = [this.localTank];
    this.initializePowerups(this.powerups);
    this.powerups.forEach((powerup) => this.scene.add(powerup));
    this.camera = new ThirdPersonViewCamera(this.localTank, window.innerWidth / window.innerHeight);
    this.renderer = new Renderer();
    this.renderer.renderer.setSize(window.innerWidth, window.innerHeight);
    this.sceneContainer.appendChild(this.renderer.renderer.domElement);
    const listener = new THREE.AudioListener();
    this.camera.camera.add(listener);
    this.listeners.push(listener);
    this.bgAudio = new THREE.Audio(listener);
    this.bgAudio.setBuffer(this.audioDict['Bgm']).setVolume(0.01).setLoop(true);
    this.loop = new Loop(this.scene, [this.camera], [this.renderer]);
    this.registerBattleHandlers();
    this.registerInputHandlers();
    this.updateSelectedTankSummary();
    this.configureTicks();
    this.loop.start();
    this.pause();
    this.setStatus('Create or join a battle');
    window.dispatchEvent(new Event('resize'));
  }

  async loadGameConfig(): Promise<void> {
    const response = await fetch('/api/game-config').catch(() => null);
    if (!response?.ok) {
      return;
    }
    const config = await response.json() as GameConfig;
    this.webSocketPath = config.webSocketPath;
  }

  async loadMaps(): Promise<void> {
    const response = await fetch('/api/maps').catch(() => null);
    if (!response?.ok) {
      this.availableMaps = [{
        id: DEFAULT_MAP_ID,
        name: 'Default Arena',
        version: 2,
        arenaSize: DEFAULT_ARENA_SIZE,
      }];
      this.renderMapSelect();
      return;
    }

    const data = await response.json() as { maps: GroundfireMapSummary[] };
    this.availableMaps = data.maps.length > 0 ? data.maps : [{
      id: DEFAULT_MAP_ID,
      name: 'Default Arena',
      version: 2,
      arenaSize: DEFAULT_ARENA_SIZE,
    }];
    if (!this.availableMaps.some((map) => map.id === this.selectedMapId)) {
      this.selectedMapId = this.availableMaps[0].id;
    }
    this.renderMapSelect();
  }

  renderMapSelect(): void {
    this.mapSelectInput.innerHTML = this.availableMaps.map((map) => (
      `<option value="${map.id}" ${map.id === this.selectedMapId ? 'selected' : ''}>${map.name}</option>`
    )).join('');
  }

  async loadMapById(mapId: string, rebuildScene = false): Promise<void> {
    const response = await fetch(`/api/maps/${encodeURIComponent(mapId)}`).catch(() => null);
    const rawMap = response?.ok
      ? (await response.json() as { map: unknown }).map
      : null;
    this.mapData = normalizeGroundfireMap(rawMap, mapId);
    this.selectedMapId = this.mapData.id;
    this.arenaSize = this.mapData.arena.size;
    this.arenaHalf = this.arenaSize / 2;
    this.mapTerrain = await this.resolveTerrainData(this.mapData);
    localStorage.setItem(STORAGE_KEYS.mapId, this.selectedMapId);
    this.renderMapSelect();

    if (rebuildScene && this.scene) {
      this.rebuildGround();
      await this.resetArena();
    }
  }

  async resolveTerrainData(map: GroundfireMap): Promise<TerrainData> {
    const terrain: TerrainData = {
      resolution: map.terrain.resolution,
      features: map.terrain.features ?? [],
      surfacePatches: map.terrain.surfacePatches ?? [],
    };

    if (map.terrain.heightmapAsset) {
      try {
        terrain.heightmap = await this.loadHeightmap(map.terrain.heightmapAsset, map.terrain.resolution, {
          heightScale: map.terrain.heightScale ?? 120,
          heightOffset: map.terrain.heightOffset ?? 0,
        });
      } catch (error) {
        console.warn(`Could not load heightmap for map "${map.id}": ${map.terrain.heightmapAsset}`, error);
      }
    }

    return terrain;
  }

  async loadHeightmap(
      path: string,
      resolution: number,
      settings: { heightScale: number; heightOffset: number },
  ): Promise<NonNullable<TerrainData['heightmap']>> {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = path;
    });
    const canvas = document.createElement('canvas');
    canvas.width = resolution;
    canvas.height = resolution;
    const context = canvas.getContext('2d');
    if (!context) {
      return {
        resolution,
        samples: new Array(resolution * resolution).fill(0),
        heightScale: settings.heightScale,
        heightOffset: settings.heightOffset,
      };
    }

    context.drawImage(image, 0, 0, resolution, resolution);
    const pixels = context.getImageData(0, 0, resolution, resolution).data;
    const samples: number[] = [];
    for (let index = 0; index < pixels.length; index += 4) {
      samples.push(pixels[index] / 255);
    }

    return {
      resolution,
      samples,
      heightScale: settings.heightScale,
      heightOffset: settings.heightOffset,
    };
  }

  rebuildGround(): void {
    this.ground?.destruct();
    this.ground = new Ground('main', this.textureDict['ground'], this.arenaSize, this.mapTerrain);
    this.scene.add(this.ground);
  }

  async loadGltf(gltfLoader: GLTFLoader, path: string): Promise<THREE.Group> {
    try {
      return await new Promise((resolve, reject) => {
        gltfLoader.load(path, (gltf) => resolve(gltf.scene), undefined, reject);
      });
    } catch (error) {
      if (!path.toLowerCase().endsWith('.glb')) {
        throw error;
      }

      console.warn(`Failed to load GLB with textures, retrying without textures: ${path}`, error);
      const response = await fetch(path);
      if (!response.ok) {
        throw error;
      }

      const texturelessGlb = this.createTexturelessGlb(await response.arrayBuffer());
      const basePath = path.slice(0, path.lastIndexOf('/') + 1);
      return await new Promise((resolve, reject) => {
        gltfLoader.parse(texturelessGlb, basePath, (gltf) => resolve(gltf.scene), reject);
      });
    }
  }

  async loadModel(loaders: {
    gltfLoader: GLTFLoader;
    mtlLoader: MTLLoader;
    objLoader: OBJLoader;
  }, path: string): Promise<THREE.Group> {
    if (path.toLowerCase().endsWith('.obj')) {
      return this.loadObjModel(loaders.mtlLoader, loaders.objLoader, path);
    }

    return this.loadGltf(loaders.gltfLoader, path);
  }

  async loadObjModel(mtlLoader: MTLLoader, objLoader: OBJLoader, path: string): Promise<THREE.Group> {
    const basePath = path.slice(0, path.lastIndexOf('/') + 1);
    const fileName = path.slice(path.lastIndexOf('/') + 1);
    const materialFileName = fileName.replace(/\.obj$/i, '.mtl');

    const objectLoader = new OBJLoader(objLoader.manager).setPath(basePath);
    try {
      const materials = await new Promise<MTLLoader.MaterialCreator>((resolve, reject) => {
        mtlLoader.setPath(basePath).load(materialFileName, resolve, undefined, reject);
      });
      materials.preload();
      objectLoader.setMaterials(materials);
    } catch (error) {
      console.warn(`Failed to load MTL for OBJ, using generated materials: ${path}`, error);
    }

    return await new Promise((resolve, reject) => {
      objectLoader.load(fileName, (object) => resolve(object), undefined, reject);
    });
  }

  createTexturelessGlb(source: ArrayBuffer): ArrayBuffer {
    const sourceView = new DataView(source);
    const magic = sourceView.getUint32(0, true);
    const version = sourceView.getUint32(4, true);
    const jsonLength = sourceView.getUint32(12, true);
    const jsonType = sourceView.getUint32(16, true);
    if (magic !== 0x46546c67 || version !== 2 || jsonType !== 0x4e4f534a) {
      throw new Error('Unsupported GLB format');
    }

    const jsonOffset = 20;
    const decoder = new TextDecoder();
    const jsonText = decoder.decode(new Uint8Array(source, jsonOffset, jsonLength)).trim();
    const gltf = JSON.parse(jsonText) as {
      images?: unknown[];
      materials?: Array<{
        normalTexture?: unknown;
        occlusionTexture?: unknown;
        emissiveTexture?: unknown;
        pbrMetallicRoughness?: {
          baseColorTexture?: unknown;
          metallicRoughnessTexture?: unknown;
        };
      }>;
      samplers?: unknown[];
      textures?: unknown[];
    };

    delete gltf.images;
    delete gltf.samplers;
    delete gltf.textures;
    gltf.materials?.forEach((material) => {
      delete material.normalTexture;
      delete material.occlusionTexture;
      delete material.emissiveTexture;
      delete material.pbrMetallicRoughness?.baseColorTexture;
      delete material.pbrMetallicRoughness?.metallicRoughnessTexture;
    });

    const encoder = new TextEncoder();
    const jsonBytes = encoder.encode(JSON.stringify(gltf));
    const paddedJsonLength = Math.ceil(jsonBytes.byteLength / 4) * 4;
    const binHeaderOffset = jsonOffset + jsonLength;
    const binLength = sourceView.getUint32(binHeaderOffset, true);
    const binType = sourceView.getUint32(binHeaderOffset + 4, true);
    const binOffset = binHeaderOffset + 8;
    const targetLength = 12 + 8 + paddedJsonLength + 8 + binLength;
    const target = new ArrayBuffer(targetLength);
    const targetView = new DataView(target);
    const targetBytes = new Uint8Array(target);

    targetView.setUint32(0, magic, true);
    targetView.setUint32(4, version, true);
    targetView.setUint32(8, targetLength, true);
    targetView.setUint32(12, paddedJsonLength, true);
    targetView.setUint32(16, jsonType, true);
    targetBytes.set(jsonBytes, 20);
    targetBytes.fill(0x20, 20 + jsonBytes.byteLength, 20 + paddedJsonLength);

    const targetBinHeaderOffset = 20 + paddedJsonLength;
    targetView.setUint32(targetBinHeaderOffset, binLength, true);
    targetView.setUint32(targetBinHeaderOffset + 4, binType, true);
    targetBytes.set(new Uint8Array(source, binOffset, binLength), targetBinHeaderOffset + 8);
    return target;
  }

  async loadAssets(): Promise<void> {
    const fallbackTextureSvg = (fill: string): string => (
        `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="${fill}"/></svg>`,
        )}`
    );
    const createFallbackBrickTexture = (): THREE.Texture => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const context = canvas.getContext('2d');
      if (!context) {
        return new THREE.Texture();
      }

      context.fillStyle = '#8a765a';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = '#d0b78d';
      context.lineWidth = 5;

      const rowHeight = 32;
      const brickWidth = 64;
      for (let y = 0; y <= canvas.height; y += rowHeight) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(canvas.width, y);
        context.stroke();

        const offset = (y / rowHeight) % 2 === 0 ? 0 : brickWidth / 2;
        for (let x = -offset; x <= canvas.width; x += brickWidth) {
          context.beginPath();
          context.moveTo(x, y);
          context.lineTo(x, y + rowHeight);
          context.stroke();
        }
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      return texture;
    };
    const fallbackAlbedoTexture = fallbackTextureSvg('#8f9180');
    const fallbackNormalTexture = fallbackTextureSvg('#8080ff');
    const loadingManager = new THREE.LoadingManager();
    loadingManager.setURLModifier((url) => {
      if (typeof url !== 'string' || url.trim() === '' || url === 'undefined') {
        return fallbackAlbedoTexture;
      }

      const normalizedUrl = url.replaceAll('\\', '/');
      const isExportedLocalPath = /^[a-z]:/i.test(normalizedUrl) || normalizedUrl.includes('/Users/');
      return isExportedLocalPath
          ? (/normal/i.test(normalizedUrl) ? fallbackNormalTexture : fallbackAlbedoTexture)
          : url;
    });
    const gltfLoader = new GLTFLoader(loadingManager);
    const mtlLoader = new MTLLoader(loadingManager);
    const objLoader = new OBJLoader(loadingManager);
    const modelLoaders = {gltfLoader, mtlLoader, objLoader};
    const modelPromise = (path: string): Promise<THREE.Group> => this.loadModel(modelLoaders, path);
    const audioLoader = new THREE.AudioLoader();
    const audioPromise = (path: string): Promise<AudioBuffer> => (
        new Promise((resolve, reject) => {
          audioLoader.load(path, resolve, undefined, reject);
        })
    );
    const textureLoader = new THREE.TextureLoader(loadingManager);
    const texturePromise = (path: string | undefined, fallback?: THREE.Texture): Promise<THREE.Texture> => {
      if (!path) {
        if (fallback) {
          return Promise.resolve(fallback);
        }

        return Promise.reject(new Error('Texture path is missing'));
      }

      return new Promise((resolve, reject) => {
        textureLoader.load(path, resolve, undefined, reject);
      });
    };
    const assetBase = '/battletanks';
    const [tankEntries, bulletMesh, powerupMesh] = await Promise.all([
      Promise.all(TANK_DEFINITIONS.map(async (definition) => ({
        definition,
        mesh: await modelPromise(definition.modelPath),
      }))),
      modelPromise(`${assetBase}/bullet_model/scene.gltf`),
      modelPromise(`${assetBase}/powerup_model/scene.gltf`),
    ]);
    tankEntries.forEach(({definition, mesh}) => {
      this.meshDict[this.tankMeshKey(definition.id)] = mesh.clone();
    });
    this.meshDict['Bullet'] = bulletMesh.children[0].children[0].children[0].children[0].children[0].clone();
    this.meshDict['Powerup'] = powerupMesh.children[0].children[0].children[0].clone();

    const [powerupAudio, bulletHitAudio, explosionAudio, bgmAudio] = await Promise.all([
      audioPromise(`${assetBase}/audio/powerup.mp3`),
      audioPromise(`${assetBase}/audio/bullet_hit.mp3`),
      audioPromise(`${assetBase}/audio/explosion.mp3`),
      audioPromise(`${assetBase}/audio/bgm.mp3`),
    ]);
    this.audioDict['Powerup'] = powerupAudio;
    this.audioDict['Bullet_hit'] = bulletHitAudio;
    this.audioDict['Explosion'] = explosionAudio;
    this.audioDict['Bgm'] = bgmAudio;

    this.textureDict['ground'] = {};
    const groundBase = `${assetBase}/grassy-meadow1-bl/grassy-meadow1`;
    const [albedo, ao, height, metallic, normal, roughness] = await Promise.all([
      texturePromise(`${groundBase}_albedo.png`),
      texturePromise(`${groundBase}_ao.png`),
      texturePromise(`${groundBase}_height.png`),
      texturePromise(`${groundBase}_metallic.png`),
      texturePromise(`${groundBase}_normal-ogl.png`),
      texturePromise(`${groundBase}_roughness.png`),
    ]);
    this.textureDict['ground'] = {albedo, ao, height, metallic, normal, roughness};

    const wallAlbedoUrl = new URL('../../assets/textures/brick/tx.png', import.meta.url).href;
    const wallAlbedo = await texturePromise(
        wallAlbedoUrl,
        createFallbackBrickTexture(),
    );
    wallAlbedo.colorSpace = THREE.SRGBColorSpace;
    wallAlbedo.wrapS = THREE.RepeatWrapping;
    wallAlbedo.wrapT = THREE.RepeatWrapping;

    this.textureDict['wall'] = {albedo: wallAlbedo};
  }

  tankMeshKey(tankId: string): string {
    return `Tank:${tankId}`;
  }

  tankMeshFor(definition: TankDefinition): THREE.Object3D {
    return this.meshDict[this.tankMeshKey(definition.id)] ?? this.meshDict[this.tankMeshKey(DEFAULT_TANK_ID)];
  }

  tankConfig(definition: TankDefinition): Partial<Tank> {
    return {
      tankDefinition: definition,
      tankModelId: definition.id,
    };
  }

  terrainPosition(x: number, y: number, zOffset = 0): THREE.Vector3 {
    return new THREE.Vector3(x, y, this.ground.heightAt(x, y) + zOffset);
  }

  snapTankToTerrain(tank: Tank, immediate = false): void {
    tank.alignToGround(this.ground, immediate);
  }

  createPlayerTank(name: string): Tank {
    const definition = getTankDefinition(this.selectedTankId);
    const tank = new Tank(name, this.tankMeshFor(definition), this.meshDict['Bullet'], this.listeners, this.audioDict, {
      ...this.tankConfig(definition),
      proceedUpKey: 'KeyW',
      proceedDownKey: 'KeyS',
      rotateLeftKey: 'KeyA',
      rotateRightKey: 'KeyD',
      firingKey: 'Space',
    });
    this.snapTankToTerrain(tank, true);
    return tank;
  }

  createRemoteTank(id: string, tankModelId = DEFAULT_TANK_ID): Tank {
    const definition = getTankDefinition(tankModelId);
    const tank = new Tank(`remote-${id}`, this.tankMeshFor(definition), this.meshDict['Bullet'], this.listeners, this.audioDict, {
      ...this.tankConfig(definition),
      firingKey: '__disabled__',
    });
    this.snapTankToTerrain(tank, true);
    this.scene.add(tank);
    this.remoteTanks.set(id, tank);
    this.tanks.push(tank);
    return tank;
  }

  async resetArena(): Promise<void> {
    this.bullets.forEach((bullet) => bullet.destruct());
    this.bullets = [];
    this.walls.forEach((wall) => wall.destruct());
    this.walls = [];
    this.surrounding_walls = [];
    this.destructibleModels.forEach((model) => model.destruct());
    this.destructibleModels = [];
    this.disposeWaterMeshes();
    this.waterCells = [];
    this.waterCellLookup.clear();
    this.waterMinimapCells = [];
    this.waterFlowAccumulator = 0;
    this.destroyedWallIds.clear();
    this.destroyedModelChunkIds.clear();
    this.occludedWallIds.clear();
    this.initializeWalls(this.walls, this.surrounding_walls);
    this.walls.forEach((wall) => this.scene.add(wall));
    await this.initializeDestructibleModels();
    this.initializeWater();
    this.powerups.forEach((powerup) => powerup.destruct());
    this.powerups = [];
    this.initializePowerups(this.powerups);
    this.powerups.forEach((powerup) => this.scene.add(powerup));
    this.localTank?.reset();
    if (this.localTank) {
      this.snapTankToTerrain(this.localTank, true);
    }
  }

  initializeWalls(walls: Wall[], surrounding_walls: Wall[]): void {
    const mapWallTexture = this.textureDict['wall'];
    const maxWallBlockHeight = MAP_BLOCK_HEIGHT;

    this.mapData.elements.forEach((wallData) => {
      const heightBlockCount = Math.max(1, Math.ceil(wallData.size[2] / maxWallBlockHeight));
      const blockHeight = wallData.size[2] / heightBlockCount;
      const wallBaseZ = wallData.position[2] + this.ground.heightAt(wallData.position[0], wallData.position[1]);
      const destructible = wallData.destructible ?? {enabled: true, health: 20};

      for (let heightIndex = 0; heightIndex < heightBlockCount; heightIndex++) {
        const wallId = heightBlockCount === 1 ? wallData.id : `${wallData.id}-h${heightIndex}`;
        const wall = new Wall(
            'main',
            mapWallTexture,
            new THREE.Vector3(wallData.size[0], wallData.size[1], blockHeight),
            new THREE.Vector3(
                wallData.position[0],
                wallData.position[1],
                wallBaseZ + blockHeight / 2 + heightIndex * blockHeight,
            ),
            new THREE.Euler(...wallData.rotation),
            {
              id: wallId,
              destructible: destructible.enabled,
              health: destructible.health,
              uv: wallData.textureMapping?.uv,
            },
        );
        walls.push(wall);
        if (wallData.role === 'boundary') {
          surrounding_walls.push(wall);
        }
      }
    });
  }

  async initializeDestructibleModels(): Promise<void> {
    const models = this.mapData.destructibleModels;
    if (models.length === 0) {
      return;
    }

    const loadedModels = await Promise.all(models.map(async (modelData) => {
      try {
        const model = await DestructibleModel.load(modelData, this.mapAssetUrl(modelData.asset));
        this.scene.scene.add(model.root);
        return model;
      } catch (error) {
        console.warn(`Could not load destructible model "${modelData.id}"`, error);
        return null;
      }
    }));

    this.destructibleModels = loadedModels.filter((model): model is DestructibleModel => Boolean(model));
    this.destroyedModelChunkIds.forEach((chunkId) => this.applyDestroyedModelChunk(chunkId));
  }

  mapAssetUrl(asset: string): string {
    if (/^(data|blob|https?):/i.test(asset) || asset.startsWith('/api/')) {
      return asset;
    }

    return `/api/maps/${encodeURIComponent(this.mapData.id)}/assets/${asset
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/')}`;
  }

  updateStructuralGravity(delta: number): void {
    let destroyedByImpact = false;
    let waterNeedsRebuild = false;
    const structuralWalls = this.walls
      .filter((wall) => wall.isStructuralActive())
      .sort((a, b) => a.bottomZ() - b.bottomZ());

    structuralWalls.forEach((wall) => {
      const supportHeight = this.structuralSupportHeight(wall);
      const unsupported = wall.bottomZ() > supportHeight + STRUCTURAL_DETACH_EPSILON;
      if (!wall.falling && unsupported) {
        wall.beginFall();
      }

      if (!wall.falling) {
        return;
      }

      const impact = wall.updateFall(delta, supportHeight, STRUCTURAL_GRAVITY, STRUCTURAL_MAX_FALL_SPEED);
      if (!impact) {
        return;
      }

      waterNeedsRebuild = true;
      const damage = this.structuralImpactDamage(impact.distance);
      if (damage <= 0) {
        return;
      }

      const destroyed = wall.damage(damage);
      if (destroyed && this.recordDestroyedWall(wall)) {
        destroyedByImpact = true;
      }
    });

    if (waterNeedsRebuild) {
      this.queueWaterRebuild();
      this.updateMinimap();
    }
    if (destroyedByImpact) {
      this.syncDestroyedWalls();
    }
  }

  structuralSupportHeight(wall: Wall): number {
    const wallBox = new THREE.Box3().setFromObject(wall.mesh);
    const wallBottom = wall.bottomZ();
    let supportHeight = this.ground.heightAt(wall.mesh.position.x, wall.mesh.position.y);

    this.walls.forEach((candidate) => {
      if (candidate === wall || !candidate.isStructuralActive() || candidate.falling) {
        return;
      }

      const candidateTop = candidate.topZ();
      if (candidateTop > wallBottom + STRUCTURAL_SUPPORT_EPSILON || candidateTop <= supportHeight + STRUCTURAL_SUPPORT_EPSILON) {
        return;
      }

      const candidateBox = new THREE.Box3().setFromObject(candidate.mesh);
      if (!this.structuralFootprintsOverlap(wallBox, candidateBox)) {
        return;
      }

      supportHeight = candidateTop;
    });

    return supportHeight;
  }

  structuralFootprintsOverlap(upperBox: THREE.Box3, supportBox: THREE.Box3): boolean {
    const overlapX = Math.max(0, Math.min(upperBox.max.x, supportBox.max.x) - Math.max(upperBox.min.x, supportBox.min.x));
    const overlapY = Math.max(0, Math.min(upperBox.max.y, supportBox.max.y) - Math.max(upperBox.min.y, supportBox.min.y));
    const overlapArea = overlapX * overlapY;
    if (overlapArea < STRUCTURAL_MIN_SUPPORT_AREA) {
      return false;
    }

    const upperArea = Math.max(1, (upperBox.max.x - upperBox.min.x) * (upperBox.max.y - upperBox.min.y));
    return overlapArea / upperArea >= STRUCTURAL_MIN_SUPPORT_RATIO;
  }

  structuralImpactDamage(distance: number): number {
    return Math.max(0, distance - STRUCTURAL_IMPACT_FREE_DISTANCE) * STRUCTURAL_IMPACT_DAMAGE_PER_UNIT;
  }

  initializeWater(): void {
    this.rebuildWaterSimulation();
  }

  rebuildWaterSimulation(): void {
    this.disposeWaterMeshes();
    this.waterCells = [];
    this.waterCellLookup.clear();
    this.waterMinimapCells = [];
    this.waterRebuildPending = false;

    const cellsByKey = new Map<string, WaterCell>();
    this.mapData.water
      .filter((waterSource) => (waterSource.type ?? 'basin') !== 'drain')
      .forEach((waterSource) => {
        this.computeWaterCells(waterSource).forEach((cell) => {
          const existing = cellsByKey.get(cell.key);
          if (!existing || cell.depth > existing.depth) {
            cellsByKey.set(cell.key, cell);
          }
        });
      });

    this.mapData.water
      .filter((waterSource) => waterSource.type === 'drain')
      .forEach((waterSource) => {
        this.computeWaterCells(waterSource, false).forEach((cell) => cellsByKey.delete(cell.key));
      });

    this.waterCells = Array.from(cellsByKey.values());
    this.waterCells.forEach((cell) => {
      this.waterCellLookup.set(cell.key, cell);
      this.waterMinimapCells.push({x: cell.x, y: cell.y, size: cell.size});
    });

    const mesh = this.createWaterMeshFromCells(this.waterCells);
    if (mesh) {
      this.waterMeshes.push(mesh);
      this.scene.scene.add(mesh);
    }
  }

  disposeWaterMeshes(): void {
    this.waterMeshes.forEach((mesh) => {
      mesh.parent?.remove(mesh);
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((material) => material.dispose());
      } else {
        mesh.material.dispose();
      }
    });
    this.waterMeshes = [];
  }

  computeWaterCells(waterSource: GroundfireWaterSource, useVolumeLimit = true): WaterCell[] {
    const gridSize = WATER_GRID_SIZE;
    const cellSize = this.arenaSize / gridSize;
    const seedColumn = Math.floor((waterSource.seedPoint[0] + this.arenaHalf) / cellSize);
    const seedRow = Math.floor((this.arenaHalf - waterSource.seedPoint[1]) / cellSize);
    if (seedColumn < 0 || seedColumn >= gridSize || seedRow < 0 || seedRow >= gridSize) {
      return [];
    }

    const gameplay = this.waterGameplay(waterSource);
    const cellKey = (column: number, row: number): string => `${column}:${row}`;
    const indexFor = (column: number, row: number): number => row * gridSize + column;
    const worldCenter = (column: number, row: number): { x: number; y: number } => ({
      x: -this.arenaHalf + (column + 0.5) * cellSize,
      y: this.arenaHalf - (row + 0.5) * cellSize,
    });
    const canFill = (column: number, row: number): boolean => {
      const point = worldCenter(column, row);
      const terrainHeight = this.ground.heightAt(point.x, point.y);
      return terrainHeight <= waterSource.waterLevel
        && !this.waterCellBlockedByWall(point.x, point.y, waterSource.waterLevel, cellSize);
    };

    if (!canFill(seedColumn, seedRow)) {
      return [];
    }

    const visited = new Set<number>();
    const cells: WaterCell[] = [];
    const queue: Array<{ column: number; row: number }> = [{column: seedColumn, row: seedRow}];
    const maxVolume = useVolumeLimit ? waterSource.maxVolume ?? 0 : 0;
    let volume = 0;
    visited.add(indexFor(seedColumn, seedRow));
    for (let index = 0; index < queue.length; index += 1) {
      const {column, row} = queue[index];
      const point = worldCenter(column, row);
      const depth = Math.max(0, waterSource.waterLevel - this.ground.heightAt(point.x, point.y));
      const minX = -this.arenaHalf + column * cellSize;
      const maxY = this.arenaHalf - row * cellSize;
      const cell: WaterCell = {
        key: cellKey(column, row),
        column,
        row,
        x: minX,
        y: maxY - cellSize,
        size: cellSize,
        level: waterSource.waterLevel,
        depth,
        sourceId: waterSource.id,
        gameplay,
      };
      cells.push(cell);
      volume += depth * cellSize * cellSize;
      if (maxVolume > 0 && volume >= maxVolume) {
        continue;
      }

      [
        {column: column + 1, row},
        {column: column - 1, row},
        {column, row: row + 1},
        {column, row: row - 1},
      ].forEach((next) => {
        if (next.column < 0 || next.column >= gridSize || next.row < 0 || next.row >= gridSize) {
          return;
        }

        const nextIndex = indexFor(next.column, next.row);
        if (visited.has(nextIndex) || !canFill(next.column, next.row)) {
          return;
        }

        visited.add(nextIndex);
        queue.push(next);
      });
    }

    return cells;
  }

  createWaterMeshFromCells(cells: WaterCell[]): THREE.Mesh | null {
    if (cells.length === 0) {
      return null;
    }

    const vertices: number[] = [];
    const colors: number[] = [];
    const shallow = new THREE.Color(0x5bd9df);
    const deep = new THREE.Color(0x176f9c);
    cells.forEach((cell) => {
      const minX = cell.x;
      const maxX = cell.x + cell.size;
      const minY = cell.y;
      const maxY = cell.y + cell.size;
      const z = cell.level + 0.6;
      vertices.push(
          minX, minY, z,
          maxX, minY, z,
          maxX, maxY, z,
          minX, minY, z,
          maxX, maxY, z,
          minX, maxY, z,
      );
      const color = shallow.clone().lerp(deep, THREE.MathUtils.clamp(cell.depth / 80, 0, 1));
      for (let index = 0; index < 6; index += 1) {
        colors.push(color.r, color.g, color.b);
      }
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 0.62,
      roughness: 0.18,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'water:simulation';
    mesh.receiveShadow = true;
    return mesh;
  }

  waterGameplay(waterSource: GroundfireWaterSource): GroundfireWaterGameplay {
    return {
      ...DEFAULT_WATER_GAMEPLAY,
      ...(waterSource.gameplay ?? {}),
    };
  }

  waterCellBlockedByWall(x: number, y: number, waterLevel: number, cellSize: number): boolean {
    const halfSize = cellSize / 2;
    const cellBox = new THREE.Box3(
        new THREE.Vector3(x - halfSize, y - halfSize, waterLevel - 2),
        new THREE.Vector3(x + halfSize, y + halfSize, waterLevel + 2),
    );
    return this.walls.some((wall) => {
      if (wall.destroyed || !wall.mesh.parent) {
        return false;
      }
      const wallBox = new THREE.Box3().setFromObject(wall.mesh);
      if (waterLevel < wallBox.min.z - 2 || waterLevel > wallBox.max.z + 2) {
        return false;
      }

      const wallFootprint = new THREE.Box3(
          new THREE.Vector3(wallBox.min.x, wallBox.min.y, waterLevel - 2),
          new THREE.Vector3(wallBox.max.x, wallBox.max.y, waterLevel + 2),
      ).expandByScalar(cellSize * 0.08);
      return cellBox.intersectsBox(wallFootprint);
    });
  }

  waterCellAt(x: number, y: number): WaterCell | null {
    const cellSize = this.arenaSize / WATER_GRID_SIZE;
    const column = Math.floor((x + this.arenaHalf) / cellSize);
    const row = Math.floor((this.arenaHalf - y) / cellSize);
    if (column < 0 || column >= WATER_GRID_SIZE || row < 0 || row >= WATER_GRID_SIZE) {
      return null;
    }
    return this.waterCellLookup.get(`${column}:${row}`) ?? null;
  }

  waterDepthAt(x: number, y: number): number {
    return this.waterCellAt(x, y)?.depth ?? 0;
  }

  waterMovementAt(x: number, y: number): { movementMultiplier: number; blocksMovement: boolean } {
    const cell = this.waterCellAt(x, y);
    const terrainMultiplier = this.ground.frictionAt(x, y);
    if (!cell) {
      return {movementMultiplier: terrainMultiplier, blocksMovement: false};
    }

    return {
      movementMultiplier: terrainMultiplier * cell.gameplay.speedMultiplier,
      blocksMovement: cell.gameplay.blocksMovement && cell.depth >= cell.gameplay.depthBlockThreshold,
    };
  }

  projectileWaterHitAt(position: THREE.Vector3): WaterProjectileHit | null {
    const cell = this.waterCellAt(position.x, position.y);
    if (!cell || cell.gameplay.projectileImpact !== 'splash') {
      return null;
    }
    if (position.z > cell.level + 1.5) {
      return null;
    }
    return {
      position: new THREE.Vector3(position.x, position.y, cell.level + 1.2),
      cell,
    };
  }

  destructibleModelHitAt(object: THREE.Object3D): DestructibleModelHit | null {
    for (const model of this.destructibleModels) {
      const hit = model.findHitForObject(object);
      if (hit) {
        return hit;
      }
    }

    return null;
  }

  destructibleModelBlocksTank(tank: Tank): boolean {
    const {width, height, depth} = tank.bboxParameter;
    const tankBox = new THREE.Box3().setFromCenterAndSize(
        tank.mesh.position,
        new THREE.Vector3(width, height, depth),
    );
    return this.destructibleModels.some((model) => model.intersectsBox(tankBox));
  }

  updateWaterSimulation(delta: number): void {
    this.waterFlowAccumulator += delta;
    if (this.waterFlowAccumulator < 1 && !this.waterRebuildPending) {
      return;
    }

    const elapsed = this.waterFlowAccumulator;
    this.waterFlowAccumulator = 0;
    let changed = this.waterRebuildPending;
    this.mapData.water.forEach((waterSource) => {
      if (waterSource.type !== 'source' || !waterSource.flowRate || waterSource.flowRate <= 0) {
        return;
      }
      waterSource.waterLevel += waterSource.flowRate * elapsed;
      changed = true;
    });

    if (changed) {
      this.rebuildWaterSimulation();
      this.updateMinimap();
    }
  }

  queueWaterRebuild(): void {
    this.waterRebuildPending = true;
  }

  spawnWaterSplash(position: THREE.Vector3): void {
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x9df4ff,
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(3, 7, 24), ringMaterial);
    ring.position.copy(position);
    ring.rotation.x = 0;
    ring.renderOrder = 4;
    this.scene.scene.add(ring);

    const start = performance.now();
    const duration = 360;
    const animate = (): void => {
      const progress = Math.min(1, (performance.now() - start) / duration);
      ring.scale.setScalar(1 + progress * 3.4);
      ringMaterial.opacity = 0.78 * (1 - progress);
      if (progress < 1) {
        requestAnimationFrame(animate);
        return;
      }
      ring.parent?.remove(ring);
      ring.geometry.dispose();
      ringMaterial.dispose();
    };
    requestAnimationFrame(animate);
  }

  initializePowerups(powerups: Powerup[]): void {
    const mesh = this.meshDict['Powerup'];
    powerups.push(
        new HealthPowerup('main', mesh.children[9], this.terrainPosition(300, 50, 15), this.listeners, this.audioDict['Powerup']),
        new WeaponPowerup('main', mesh.children[1], this.terrainPosition(-300, 50, 15), this.listeners, this.audioDict['Powerup']),
        new SpeedPowerup('main', mesh.children[13], this.terrainPosition(450, -450, 15), this.listeners, this.audioDict['Powerup']),
        new AttackPowerup('main', mesh.children[2], this.terrainPosition(50, -100, 15), this.listeners, this.audioDict['Powerup']),
        new DefensePowerup('main', mesh.children[0], this.terrainPosition(50, 50, 15), this.listeners, this.audioDict['Powerup']),
        new PenetrationPowerup('main', mesh.children[11], this.terrainPosition(-300, -300, 15), this.listeners, this.audioDict['Powerup']),
        new GoalPowerup('main', mesh.children[3], this.terrainPosition(-700, 680, 15), this.listeners, this.audioDict['Powerup']),
    );
  }

  configureTicks(): void {
    this.loop.updatableLists.push([this.localTank], this.powerups, this.bullets, this.walls);
    Tank.onTick = (tank: Tank, delta: number) => {
      if (tank !== this.localTank) return;
      this.updateStructuralGravity(delta);
      this.updateWaterSimulation(delta);
      tank.update(
          this.keyboard,
          this.scene,
          this.ground,
          this.tanks,
          this.walls,
          this.surrounding_walls,
          this.bullets,
          delta,
          this.waterMovementAt(tank.mesh.position.x, tank.mesh.position.y),
          (candidate) => this.destructibleModelBlocksTank(candidate),
      );
      this.snapTankToTerrain(tank);
      this.camera.updateView(false, this.ground);
      this.updateCrosshairPosition();
      this.updateHeadingCompass();
      this.updateLocalOcclusionFade();
      this.updateMinimap();
      this.attachDestructionHooks();
      this.syncLocalTank(false);
    };
    Bullet.onTick = (bullet: Bullet, delta: number) => {
      bullet.update(
          this.ground,
          this.bullets,
          this.walls,
          this.tanks,
          delta,
          (position) => this.projectileWaterHitAt(position),
          (_bullet, hit) => this.spawnWaterSplash(hit.position),
          (object) => this.destructibleModelHitAt(object),
      );
    };
    Powerup.onTick = (powerup: Powerup) => {
      powerup.update(this.powerups, this.localTank ? [this.localTank] : [], this.walls);
    };
    Wall.onTick = (wall: Wall, delta: number) => {
      wall.update(delta);
    };
  }

  pause(): void {
    this.bgAudio?.pause();
    this.loop.updatableLists = [];
  }

  resume(): void {
    try {
      this.bgAudio?.play();
    } catch {
      // Browsers can block audio before user interaction is fully registered.
    }
    this.loop.updatableLists = [[this.localTank], this.powerups, this.bullets, this.walls].filter(Boolean);
  }

  updateCrosshairPosition(): void {
    if (!this.localTank || !this.camera) {
      return;
    }

    const crosshair = this.localTank.crosshairElement;
    if (!crosshair) {
      return;
    }

    const aimPoint = this.getCrosshairAimPoint();
    const projected = aimPoint.project(this.camera.camera);
    const width = this.renderer.renderer.domElement.clientWidth || window.innerWidth;
    const height = this.renderer.renderer.domElement.clientHeight || window.innerHeight;
    const x = (projected.x * 0.5 + 0.5) * width;
    const y = (-projected.y * 0.5 + 0.5) * height;

    crosshair.style.left = `${THREE.MathUtils.clamp(x, 24, width - 24)}px`;
    crosshair.style.top = `${THREE.MathUtils.clamp(y, 24, height - 24)}px`;
  }

  getCrosshairAimPoint(): THREE.Vector3 {
    if (!this.localTank) {
      return new THREE.Vector3();
    }

    const {origin, direction} = this.localTank.getAimRay();
    const raycaster = new THREE.Raycaster(origin, direction, 0, this.arenaSize * 2);
    const wallMeshes = this.walls
        .filter((wall) => !wall.destroyed && wall.mesh.parent)
        .map((wall) => wall.mesh);
    const [wallHit] = raycaster.intersectObjects(wallMeshes, false);
    if (wallHit) {
      return wallHit.point;
    }

    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const groundHit = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(groundPlane, groundHit)) {
      const distanceToGround = origin.distanceTo(groundHit);
      if (distanceToGround > 0 && distanceToGround <= this.arenaSize * 2) {
        return groundHit;
      }
    }

    return origin.clone().add(direction.multiplyScalar(this.arenaSize));
  }

  updateHeadingCompass(): void {
    const context = this.headingCompassContext;
    if (!context) {
      return;
    }

    const rect = this.headingCompassCanvas.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.floor(rect.width));
    const cssHeight = Math.max(1, Math.floor(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.floor(cssWidth * dpr);
    const pixelHeight = Math.floor(cssHeight * dpr);
    if (this.headingCompassCanvas.width !== pixelWidth || this.headingCompassCanvas.height !== pixelHeight) {
      this.headingCompassCanvas.width = pixelWidth;
      this.headingCompassCanvas.height = pixelHeight;
    }

    context.save();
    context.scale(dpr, dpr);
    context.clearRect(0, 0, cssWidth, cssHeight);

    if (!this.localTank) {
      context.restore();
      return;
    }

    const headingDegrees = this.compassBearingFromRadians(this.localTank.mesh.rotation.z + this.localTank.aimYaw);
    const centerX = cssWidth / 2;
    const pixelsPerDegree = cssWidth / COMPASS_VISIBLE_DEGREES;
    const tickTop = 7;
    const labelY = Math.min(cssHeight - 16, 34);
    const start = Math.floor((headingDegrees - COMPASS_VISIBLE_DEGREES / 2) / 5) * 5;
    const end = Math.ceil((headingDegrees + COMPASS_VISIBLE_DEGREES / 2) / 5) * 5;

    context.save();
    context.beginPath();
    context.rect(0, 0, cssWidth, cssHeight);
    context.clip();

    for (let bearing = start; bearing <= end; bearing += 5) {
      const normalizedBearing = this.normalizeCompassDegrees(bearing);
      const delta = this.shortestCompassDelta(normalizedBearing, headingDegrees);
      const x = centerX + delta * pixelsPerDegree;
      const isDirectionTick = normalizedBearing % 45 === 0;
      const isMajorTick = normalizedBearing % 15 === 0;
      const isMediumTick = normalizedBearing % 10 === 0;
      const tickHeight = isDirectionTick ? 20 : isMajorTick ? 15 : isMediumTick ? 11 : 7;
      const alpha = isDirectionTick ? 0.95 : isMajorTick ? 0.7 : 0.42;

      context.strokeStyle = `rgba(223, 226, 199, ${alpha})`;
      context.lineWidth = isDirectionTick ? 2 : 1;
      context.beginPath();
      context.moveTo(x, tickTop);
      context.lineTo(x, tickTop + tickHeight);
      context.stroke();

      const directionLabel = this.compassDirectionLabel(normalizedBearing);
      const label = directionLabel ?? (normalizedBearing % 30 === 0 ? normalizedBearing.toString().padStart(3, '0') : '');
      if (label) {
        context.fillStyle = directionLabel ? '#d8ff63' : 'rgba(243, 240, 220, 0.72)';
        context.font = directionLabel ? '900 11px sans-serif' : '800 9px sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(label, x, labelY);
      }
    }

    context.restore();

    const readout = `${Math.round(headingDegrees).toString().padStart(3, '0')}° ${this.compassSectorLabel(headingDegrees)}`;
    const readoutWidth = Math.max(62, Math.min(94, readout.length * 8));
    const readoutHeight = 17;
    const readoutX = centerX - readoutWidth / 2;
    const readoutY = cssHeight - readoutHeight - 3;
    context.fillStyle = 'rgba(6, 9, 7, 0.76)';
    context.fillRect(readoutX, readoutY, readoutWidth, readoutHeight);
    context.strokeStyle = 'rgba(216, 255, 99, 0.22)';
    context.strokeRect(readoutX + 0.5, readoutY + 0.5, readoutWidth - 1, readoutHeight - 1);
    context.fillStyle = '#f4f0dc';
    context.font = '900 10px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(readout, centerX, readoutY + readoutHeight / 2 + 0.5);

    context.restore();
  }

  compassBearingFromRadians(radians: number): number {
    return this.normalizeCompassDegrees(-THREE.MathUtils.radToDeg(radians));
  }

  normalizeCompassDegrees(degrees: number): number {
    return ((degrees % 360) + 360) % 360;
  }

  shortestCompassDelta(target: number, center: number): number {
    return ((target - center + 540) % 360) - 180;
  }

  compassDirectionLabel(degrees: number): string | null {
    const labels: Record<number, string> = {
      0: 'N',
      45: 'NE',
      90: 'E',
      135: 'SE',
      180: 'S',
      225: 'SW',
      270: 'W',
      315: 'NW',
    };
    return labels[Math.round(degrees)] ?? null;
  }

  compassSectorLabel(degrees: number): string {
    const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(this.normalizeCompassDegrees(degrees) / 45) % labels.length;
    return labels[index];
  }

  updateMinimap(): void {
    const context = this.minimapContext;
    if (!context || !this.localTank) {
      return;
    }

    const rect = this.minimapCanvas.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.floor(rect.width));
    const cssHeight = Math.max(1, Math.floor(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.floor(cssWidth * dpr);
    const pixelHeight = Math.floor(cssHeight * dpr);
    if (this.minimapCanvas.width !== pixelWidth || this.minimapCanvas.height !== pixelHeight) {
      this.minimapCanvas.width = pixelWidth;
      this.minimapCanvas.height = pixelHeight;
    }

    context.save();
    context.scale(dpr, dpr);
    context.clearRect(0, 0, cssWidth, cssHeight);

    const centerX = cssWidth / 2;
    const centerY = cssHeight / 2;
    const radius = Math.max(1, Math.min(cssWidth, cssHeight) / 2 - MINIMAP_EDGE_INSET);
    const scale = (radius * 2) / MINIMAP_WORLD_VIEW_SIZE;
    const localPosition = this.localTank.mesh.position;
    const localHeading = this.localTank.mesh.rotation.z;
    const headingCos = Math.cos(-localHeading);
    const headingSin = Math.sin(-localHeading);
    const toMap = (position: THREE.Vector3): { x: number; y: number } => ({
      x: centerX + ((position.x - localPosition.x) * headingCos - (position.y - localPosition.y) * headingSin) * scale,
      y: centerY - ((position.x - localPosition.x) * headingSin + (position.y - localPosition.y) * headingCos) * scale,
    });

    context.fillStyle = 'rgba(16, 25, 15, 0.94)';
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = 'rgba(215, 230, 92, 0.3)';
    context.lineWidth = 1;
    [0.34, 0.67, 1].forEach((ringScale) => {
      context.beginPath();
      context.arc(centerX, centerY, radius * ringScale, 0, Math.PI * 2);
      context.stroke();
    });

    context.strokeStyle = 'rgba(215, 230, 92, 0.12)';
    context.beginPath();
    context.moveTo(centerX - radius, centerY);
    context.lineTo(centerX + radius, centerY);
    context.moveTo(centerX, centerY - radius);
    context.lineTo(centerX, centerY + radius);
    context.stroke();

    context.save();
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.clip();

    context.strokeStyle = 'rgba(215, 230, 92, 0.08)';
    context.lineWidth = 1;
    const gridStep = 25 * scale;
    const gridExtent = Math.ceil(radius / gridStep) * gridStep;
    for (let offset = -gridExtent; offset <= gridExtent; offset += gridStep) {
      const verticalStart = this.rotateMinimapOffset(offset, -gridExtent, localHeading);
      const verticalEnd = this.rotateMinimapOffset(offset, gridExtent, localHeading);
      context.beginPath();
      context.moveTo(centerX + verticalStart.x, centerY + verticalStart.y);
      context.lineTo(centerX + verticalEnd.x, centerY + verticalEnd.y);
      context.stroke();

      const horizontalStart = this.rotateMinimapOffset(-gridExtent, offset, localHeading);
      const horizontalEnd = this.rotateMinimapOffset(gridExtent, offset, localHeading);
      context.beginPath();
      context.moveTo(centerX + horizontalStart.x, centerY + horizontalStart.y);
      context.lineTo(centerX + horizontalEnd.x, centerY + horizontalEnd.y);
      context.stroke();
    }

    this.drawMinimapWater(context, toMap, scale, localHeading);
    this.drawMinimapWalls(context, toMap, scale, localHeading);
    this.remoteTanks.forEach((tank) => this.drawMinimapTank(context, tank, toMap, '#ff6048', 4.5, localHeading));
    this.drawMinimapTank(context, this.localTank, toMap, '#d7ff58', 5.8, localHeading);

    context.restore();
    this.drawMinimapCompass(context, centerX, centerY, radius, localHeading);

    context.strokeStyle = 'rgba(243, 255, 168, 0.54)';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(centerX, centerY, radius - 0.5, 0, Math.PI * 2);
    context.stroke();

    context.restore();
  }

  rotateMinimapOffset(x: number, y: number, heading: number): { x: number; y: number } {
    const cos = Math.cos(heading);
    const sin = Math.sin(heading);
    return {
      x: x * cos - y * sin,
      y: x * sin + y * cos,
    };
  }

  drawMinimapCompass(
      context: CanvasRenderingContext2D,
      centerX: number,
      centerY: number,
      radius: number,
      heading: number,
  ): void {
    const compassRadius = Math.max(1, radius - 16);
    const cos = Math.cos(-heading);
    const sin = Math.sin(-heading);
    const directions = [
      {label: 'N', x: 0, y: 1},
      {label: 'E', x: 1, y: 0},
      {label: 'S', x: 0, y: -1},
      {label: 'W', x: -1, y: 0},
    ];

    context.save();
    context.font = '900 10px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    directions.forEach((direction) => {
      const rotatedX = direction.x * cos - direction.y * sin;
      const rotatedY = direction.x * sin + direction.y * cos;
      const x = centerX + rotatedX * compassRadius;
      const y = centerY - rotatedY * compassRadius;
      context.fillStyle = 'rgba(6, 10, 7, 0.72)';
      context.beginPath();
      context.arc(x, y, 9, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = direction.label === 'N' ? '#f7ff78' : 'rgba(223, 226, 199, 0.9)';
      context.fillText(direction.label, x, y + 0.5);
    });
    context.restore();
  }

  drawMinimapWalls(
      context: CanvasRenderingContext2D,
      toMap: (position: THREE.Vector3) => { x: number; y: number },
      scale: number,
      localHeading: number,
  ): void {
    context.fillStyle = 'rgba(226, 224, 194, 0.24)';
    this.walls.forEach((wall) => {
      if (wall.destroyed || !wall.mesh.parent) {
        return;
      }

      const point = toMap(wall.mesh.position);
      context.save();
      context.translate(point.x, point.y);
      context.rotate(localHeading - wall.mesh.rotation.z);
      context.fillRect(
          -wall.size.x * scale / 2,
          -wall.size.y * scale / 2,
          Math.max(1, wall.size.x * scale),
          Math.max(1, wall.size.y * scale),
      );
      context.restore();
    });
  }

  drawMinimapWater(
      context: CanvasRenderingContext2D,
      toMap: (position: THREE.Vector3) => { x: number; y: number },
      scale: number,
      localHeading: number,
  ): void {
    if (this.waterMinimapCells.length === 0) {
      return;
    }

    context.fillStyle = 'rgba(53, 169, 198, 0.54)';
    this.waterMinimapCells.forEach((cell) => {
      const point = toMap(new THREE.Vector3(cell.x + cell.size / 2, cell.y + cell.size / 2, 0));
      const size = Math.max(1, cell.size * scale);
      context.save();
      context.translate(point.x, point.y);
      context.rotate(localHeading);
      context.fillRect(-size / 2, -size / 2, size, size);
      context.restore();
    });
  }

  drawMinimapTank(
      context: CanvasRenderingContext2D,
      tank: Tank,
      toMap: (position: THREE.Vector3) => { x: number; y: number },
      color: string,
      radius: number,
      localHeading: number,
  ): void {
    const point = toMap(tank.mesh.position);
    const heading = -(tank.mesh.rotation.z - localHeading);
    const aimHeading = -(tank.mesh.rotation.z + tank.aimYaw - localHeading);
    const isLocalTank = tank === this.localTank;
    const contactRadius = radius * (isLocalTank ? 2.35 : 2);
    const hullLength = radius * (isLocalTank ? 2.9 : 2.55);
    const hullWidth = radius * (isLocalTank ? 1.7 : 1.5);
    const lineAlpha = isLocalTank ? 0.9 : 0.62;

    context.save();
    context.translate(point.x, point.y);
    context.rotate(aimHeading);
    context.globalAlpha = lineAlpha;
    context.shadowBlur = isLocalTank ? 9 : 5;
    context.shadowColor = color;
    context.strokeStyle = color;
    context.lineCap = 'round';
    context.lineWidth = isLocalTank ? 2 : 1.4;
    context.beginPath();
    context.moveTo(0, -radius * 0.35);
    context.lineTo(0, -radius * 3.45);
    context.stroke();
    context.restore();

    context.save();
    context.translate(point.x, point.y);
    context.globalAlpha = isLocalTank ? 0.42 : 0.28;
    context.strokeStyle = color;
    context.lineWidth = 1;
    context.beginPath();
    context.arc(0, 0, contactRadius, 0, Math.PI * 2);
    context.stroke();

    context.globalAlpha = 1;
    context.rotate(heading);
    context.shadowBlur = isLocalTank ? 11 : 6;
    context.shadowColor = color;
    context.fillStyle = isLocalTank ? 'rgba(13, 22, 8, 0.92)' : 'rgba(18, 9, 7, 0.88)';
    context.strokeStyle = color;
    context.lineJoin = 'round';
    context.lineWidth = isLocalTank ? 2 : 1.5;
    context.beginPath();
    context.moveTo(0, -hullLength * 0.68);
    context.lineTo(hullWidth * 0.58, -hullLength * 0.06);
    context.lineTo(hullWidth * 0.42, hullLength * 0.55);
    context.lineTo(0, hullLength * 0.34);
    context.lineTo(-hullWidth * 0.42, hullLength * 0.55);
    context.lineTo(-hullWidth * 0.58, -hullLength * 0.06);
    context.closePath();
    context.fill();
    context.stroke();

    context.shadowBlur = 0;
    context.fillStyle = color;
    context.beginPath();
    context.arc(0, -hullLength * 0.08, Math.max(2, radius * 0.32), 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  updateLocalOcclusionFade(): void {
    if (!this.localTank || !this.camera) {
      return;
    }

    const cameraPosition = new THREE.Vector3();
    this.camera.camera.getWorldPosition(cameraPosition);

    const tankPosition = new THREE.Vector3();
    this.localTank.mesh.getWorldPosition(tankPosition);
    tankPosition.z += 30;

    const rayDirection = tankPosition.clone().sub(cameraPosition);
    const rayDistance = rayDirection.length();
    if (rayDistance <= 0) {
      return;
    }
    rayDirection.normalize();

    const candidateWalls = this.walls.filter((wall) => !wall.destroyed && wall.mesh.parent);
    const wallByMeshId = new Map(candidateWalls.map((wall) => [wall.mesh.uuid, wall]));
    const raycaster = new THREE.Raycaster(cameraPosition, rayDirection, 0, rayDistance);
    const hits = raycaster.intersectObjects(candidateWalls.map((wall) => wall.mesh), false);
    const nextOccludedWallIds = new Set<string>();

    hits.forEach((hit) => {
      const wall = wallByMeshId.get(hit.object.uuid);
      if (wall) {
        nextOccludedWallIds.add(wall.id);
      }
    });

    this.occludedWallIds.forEach((wallId) => {
      if (nextOccludedWallIds.has(wallId)) {
        return;
      }

      this.walls.find((wall) => wall.id === wallId)?.setOcclusionFade(false);
    });

    nextOccludedWallIds.forEach((wallId) => {
      if (this.occludedWallIds.has(wallId)) {
        return;
      }

      this.walls.find((wall) => wall.id === wallId)?.setOcclusionFade(true);
    });

    this.occludedWallIds = nextOccludedWallIds;
  }

  renderTankSelection(): void {
    this.renderTankSelectionOptions();

    this.updateSelectedTankSummary();

    this.tankSelectionElement.addEventListener('click', (event) => {
      const target = event.target;
      const countryToggle = target instanceof Element ? target.closest<HTMLButtonElement>('[data-country-toggle]') : null;
      if (countryToggle) {
        this.tankCountryFilterOpen = !this.tankCountryFilterOpen;
        this.renderTankSelectionOptions();
        return;
      }

      const countryFilter = target instanceof Element ? target.closest<HTMLButtonElement>('[data-country-filter]') : null;
      if (countryFilter) {
        this.selectedTankCountry = countryFilter.dataset.countryFilter ?? 'all';
        this.tankCountryFilterOpen = false;
        this.renderTankSelectionOptions();
        const visibleDefinitions = this.filteredTankDefinitions();
        if (!visibleDefinitions.some((definition) => definition.id === this.modalTankId)) {
          this.previewTank(visibleDefinitions[0]?.id ?? this.selectedTankId);
        }
        return;
      }

      const option = target instanceof Element ? target.closest<HTMLButtonElement>('[data-tank-id]') : null;
      if (!option) {
        return;
      }

      this.previewTank(option.dataset.tankId ?? this.selectedTankId);
    });
    this.tankSelectButton.addEventListener('click', () => this.openTankModal());
    this.tankModalCloseButton.addEventListener('click', () => this.closeTankModal(false));
    this.tankModalConfirmButton.addEventListener('click', () => this.closeTankModal(true));
    this.tankModal.addEventListener('click', (event) => {
      if (event.target === this.tankModal) {
        this.closeTankModal(false);
      }
    });
  }

  tankCountries(): string[] {
    return [...new Set(TANK_DEFINITIONS.map((definition) => definition.country))].sort((a, b) => a.localeCompare(b));
  }

  filteredTankDefinitions(): TankDefinition[] {
    if (this.selectedTankCountry === 'all') {
      return TANK_DEFINITIONS;
    }
    return TANK_DEFINITIONS.filter((definition) => definition.country === this.selectedTankCountry);
  }

  renderTankSelectionOptions(): void {
    const countryButtons = [
      {label: 'All', value: 'all', count: TANK_DEFINITIONS.length},
      ...this.tankCountries().map((country) => ({
        label: country,
        value: country,
        count: TANK_DEFINITIONS.filter((definition) => definition.country === country).length,
      })),
    ];
    const selectedCountry = countryButtons.find((country) => country.value === this.selectedTankCountry) ?? countryButtons[0];
    const countryOptions = countryButtons.filter((country) => country.value !== selectedCountry.value);
    const visibleDefinitions = this.filteredTankDefinitions();

    this.tankSelectionElement.innerHTML = `
      <div class="tank-country-filter" aria-label="Filter tanks by country" data-open="${this.tankCountryFilterOpen}">
        <span>Country</span>
        <button
          class="tank-country-filter__toggle"
          type="button"
          data-country-toggle
          aria-expanded="${this.tankCountryFilterOpen}"
        >
          <strong>${selectedCountry.label}</strong>
          <small>${selectedCountry.count}</small>
        </button>
        ${this.tankCountryFilterOpen ? `
          <div class="tank-country-filter__options">
            ${countryOptions.map((country) => `
            <button
              class="tank-country-filter__button"
              type="button"
              data-country-filter="${country.value}"
            >
              ${country.label}
              <small>${country.count}</small>
            </button>
          `).join('')}
          </div>
        ` : ''}
      </div>
      <div class="tank-modal__options">
        ${visibleDefinitions.map((definition) => `
          <button class="tank-modal__option" type="button" data-tank-id="${definition.id}" data-selected="${definition.id === this.modalTankId}">
            <strong>${definition.name}</strong>
            <span>${definition.country} • ${definition.year} • ${definition.role}</span>
            <p>${definition.origin}</p>
            <small>${this.tankStatsSummary(definition)}</small>
          </button>
        `).join('')}
      </div>
    `;
  }

  tankStatsSummary(definition: TankDefinition): string {
    const {stats} = definition;
    const primaryWeapon = stats.weapons.find((weapon) => weapon.slot === 'primary') ?? stats.weapons[0];
    const armor = Math.round(stats.defense * 100);
    const reload = (stats.fireCooldownMs / 1000).toFixed(1);
    const turret = stats.hasRotatingTurret ? `${stats.turretTraverseDegPerSecond}°/s turret` : 'fixed gun';
    const splash = primaryWeapon ? ` • Splash ${primaryWeapon.splashRadius}` : '';
    return `HP ${stats.maxHealth} • Armor ${armor}% • Speed ${stats.moveSpeed} • DMG ${stats.bulletDamage}${splash} • ${reload}s reload • ${turret}`;
  }

  updateSelectedTankSummary(): void {
    const definition = getTankDefinition(this.selectedTankId);
    this.selectedTankNameElement.textContent = definition.name;
    this.selectedTankRoleElement.textContent = `${definition.country} • ${definition.year}`;
  }

  openTankModal(): void {
    this.modalTankId = this.selectedTankId;
    this.tankCountryFilterOpen = false;
    this.renderTankSelectionOptions();
    this.tankModal.classList.remove('hidden');
    this.tankModal.setAttribute('aria-hidden', 'false');
    this.previewTank(this.modalTankId);
  }

  closeTankModal(confirmSelection: boolean): void {
    if (confirmSelection) {
      this.setSelectedTank(this.modalTankId);
    }
    this.tankModal.classList.add('hidden');
    this.tankModal.setAttribute('aria-hidden', 'true');
    this.stopTankPreview();
  }

  previewTank(tankId: string): void {
    const definition = getTankDefinition(tankId);
    this.modalTankId = definition.id;
    this.tankPreviewNameElement.textContent = definition.name;
    this.tankPreviewRoleElement.textContent = `${definition.country} • ${definition.year} • ${definition.role}`;
    this.tankPreviewDescriptionElement.textContent = `${definition.origin}\n${this.tankStatsSummary(definition)}\n${definition.stats.mainWeapon}${definition.stats.specialWeapon ? ` • ${definition.stats.specialWeapon}` : ''}`;
    this.tankSelectionElement.querySelectorAll<HTMLElement>('[data-tank-id]').forEach((option) => {
      option.dataset.selected = String(option.dataset.tankId === definition.id);
    });

    const sourceMesh = this.tankMeshFor(definition);
    if (!sourceMesh) {
      return;
    }

    this.setupTankPreview();
    if (!this.tankPreviewScene || !this.tankPreviewRoot || !this.tankPreviewCamera) {
      return;
    }

    if (this.tankPreviewModel) {
      this.tankPreviewRoot.remove(this.tankPreviewModel.root);
      this.tankPreviewModel.dispose();
      this.tankPreviewModel = null;
    }

    this.tankPreviewModel = new TankModel(sourceMesh, definition);
    this.tankPreviewRoot.add(this.tankPreviewModel.root);

    const size = new THREE.Vector3();
    new THREE.Box3().setFromObject(this.tankPreviewModel.root).getSize(size);
    const distance = Math.max(size.x, size.y, size.z) * 2.45;
    this.tankPreviewCamera.position.set(0, -distance, Math.max(52, distance * 0.42));
    this.tankPreviewCamera.lookAt(0, 0, Math.max(18, size.z * 0.42));
    this.resizeTankPreview();
    this.startTankPreview();
  }

  setupTankPreview(): void {
    if (this.tankPreviewRenderer && this.tankPreviewScene && this.tankPreviewRoot && this.tankPreviewCamera) {
      return;
    }

    this.tankPreviewScene = new THREE.Scene();
    this.tankPreviewScene.background = new THREE.Color(0x11170f);
    this.tankPreviewRoot = new THREE.Group();
    this.tankPreviewScene.add(this.tankPreviewRoot);

    const hemiLight = new THREE.HemisphereLight(0xe5f0ff, 0x3d321f, 2.6);
    const keyLight = new THREE.DirectionalLight(0xfff1d2, 3.8);
    keyLight.position.set(80, -90, 120);
    this.tankPreviewScene.add(hemiLight, keyLight);

    const floor = new THREE.Mesh(
        new THREE.CircleGeometry(95, 48),
        new THREE.MeshStandardMaterial({color: 0x26321f, roughness: 0.9}),
    );
    floor.name = 'tank_preview_floor';
    floor.receiveShadow = true;
    this.tankPreviewScene.add(floor);

    this.tankPreviewCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    this.tankPreviewCamera.up.set(0, 0, 1);
    this.tankPreviewRenderer = new THREE.WebGLRenderer({antialias: true});
    this.tankPreviewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.tankPreviewRenderer.shadowMap.enabled = true;
    this.tankPreviewRenderer.setClearColor(0x11170f, 1);
    this.tankPreviewElement.replaceChildren(this.tankPreviewRenderer.domElement);
  }

  resizeTankPreview(): void {
    if (!this.tankPreviewRenderer || !this.tankPreviewCamera) {
      return;
    }

    const rect = this.tankPreviewElement.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    this.tankPreviewRenderer.setSize(width, height, false);
    this.tankPreviewCamera.aspect = width / height;
    this.tankPreviewCamera.updateProjectionMatrix();
  }

  startTankPreview(): void {
    if (!this.tankPreviewRenderer || !this.tankPreviewScene || !this.tankPreviewCamera || !this.tankPreviewRoot) {
      return;
    }

    this.tankPreviewRenderer.setAnimationLoop(() => {
      if (!this.tankPreviewRenderer || !this.tankPreviewScene || !this.tankPreviewCamera || !this.tankPreviewRoot) {
        return;
      }

      this.tankPreviewRoot.rotation.z += 0.006;
      this.tankPreviewModel?.setTurretYaw(Math.sin(performance.now() * 0.0012) * 0.45);
      this.tankPreviewRenderer.render(this.tankPreviewScene, this.tankPreviewCamera);
    });
  }

  stopTankPreview(): void {
    this.tankPreviewRenderer?.setAnimationLoop(null);
  }

  setSelectedTank(tankId: string): void {
    const definition = getTankDefinition(tankId);
    this.selectedTankId = definition.id;
    localStorage.setItem(STORAGE_KEYS.tankModelId, definition.id);
    this.updateSelectedTankSummary();
    this.applySelectedTankToLocal();
  }

  applySelectedTankToLocal(): void {
    if (!this.localTank) {
      return;
    }

    const definition = getTankDefinition(this.selectedTankId);
    const mesh = this.tankMeshFor(definition);
    if (!mesh) {
      return;
    }

    Object.assign(this.localTank, this.tankConfig(definition));
    this.localTank.setTankModel(mesh, definition);
  }

  registerBattleHandlers(): void {
    this.nickInput.addEventListener('input', () => {
      localStorage.setItem(STORAGE_KEYS.nick, sanitizeNick(this.nickInput.value));
    });
    this.mapSelectInput.addEventListener('change', () => {
      this.selectedMapId = this.mapSelectInput.value || DEFAULT_MAP_ID;
      localStorage.setItem(STORAGE_KEYS.mapId, this.selectedMapId);
    });
    this.createButton.addEventListener('click', () => {
      void this.createBattle();
    });
    this.joinButton.addEventListener('click', () => {
      void this.joinBattle(this.battleIdInput.value);
    });
    this.controlsButton.addEventListener('click', () => this.openControlsModal());
    this.controlsModalCloseButton.addEventListener('click', () => this.closeControlsModal());
    this.controlsModal.addEventListener('click', (event) => {
      if (event.target === this.controlsModal) {
        this.closeControlsModal();
      }
    });
  }

  registerInputHandlers(): void {
    window.addEventListener('keydown', (event) => {
      const weaponIndex = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4'].indexOf(event.code);
      if (weaponIndex >= 0 && !event.repeat && this.status !== 'menu') {
        this.localTank?.selectWeapon(weaponIndex % 4);
        event.preventDefault();
        return;
      }
      if (event.code === 'Escape' && !this.controlsModal.classList.contains('hidden')) {
        this.closeControlsModal();
        return;
      }
      if (event.code === 'Escape' && !this.tankModal.classList.contains('hidden')) {
        this.closeTankModal(false);
        return;
      }
      if (event.code === 'KeyC' && !event.repeat && this.status !== 'menu') {
        this.camera.toggleMode();
        event.preventDefault();
      }
      if (event.code === 'KeyV' && !event.repeat && this.status !== 'menu') {
        const followsTurret = this.camera.toggleChaseTurretFollow();
        if (this.currentBattle) {
          this.setStatus(`${this.formatBattleStatus(this.currentBattle)} | chase: ${followsTurret ? 'barrel' : 'hull'}`);
        }
        event.preventDefault();
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyQ', 'KeyE', 'KeyR', 'KeyF', 'KeyT', 'KeyC', 'KeyV', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4'].includes(event.code)) {
        event.preventDefault();
      }
      this.keyboard[event.code] = 1;
      if (event.code === 'ArrowUp') this.keyboard.KeyW = 1;
      if (event.code === 'ArrowDown') this.keyboard.KeyS = 1;
      if (event.code === 'ArrowLeft') this.keyboard.KeyA = 1;
      if (event.code === 'ArrowRight') this.keyboard.KeyD = 1;
    });
    window.addEventListener('keyup', (event) => {
      this.keyboard[event.code] = 0;
      if (event.code === 'ArrowUp') this.keyboard.KeyW = 0;
      if (event.code === 'ArrowDown') this.keyboard.KeyS = 0;
      if (event.code === 'ArrowLeft') this.keyboard.KeyA = 0;
      if (event.code === 'ArrowRight') this.keyboard.KeyD = 0;
    });
    window.addEventListener('resize', () => {
      this.camera.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.camera.updateProjectionMatrix();
      this.renderer.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.renderer.setPixelRatio(window.devicePixelRatio);
      this.resizeTankPreview();
      this.updateHeadingCompass();
      this.updateMinimap();
    });
  }

  openControlsModal(): void {
    this.controlsModal.classList.remove('hidden');
    this.controlsModal.setAttribute('aria-hidden', 'false');
  }

  closeControlsModal(): void {
    this.controlsModal.classList.add('hidden');
    this.controlsModal.setAttribute('aria-hidden', 'true');
  }

  async createBattle(): Promise<void> {
    this.setStatus('Creating battle...');
    const response = await fetch('/api/battles', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        nick: sanitizeNick(this.nickInput.value),
        playerId: this.playerId,
        title: this.battleTitleInput.value.trim() || 'BattleTanks arena',
        maxPlayers: Number(this.maxPlayersInput.value) || 4,
        mapId: this.selectedMapId,
      }),
    });
    if (!response.ok) {
      this.setStatus('Could not create battle');
      return;
    }
    const data = await response.json() as { battle: BattleSummary; playerId: string };
    this.playerId = data.playerId;
    localStorage.setItem(STORAGE_KEYS.playerId, this.playerId);
    localStorage.setItem(STORAGE_KEYS.battleId, data.battle.id);
    this.battleIdInput.value = data.battle.id;
    this.currentBattle = data.battle;
    await this.startOnlineGame();
  }

  async joinBattle(id: string): Promise<void> {
    const battleId = id.trim();
    if (!battleId) {
      this.setStatus('Paste battle UUID first');
      return;
    }
    this.setStatus('Joining battle...');
    const response = await fetch(`/api/battles/${encodeURIComponent(battleId)}/join`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        nick: sanitizeNick(this.nickInput.value),
        playerId: this.playerId,
      }),
    });
    if (!response.ok) {
      this.setStatus('Could not join battle');
      return;
    }
    const data = await response.json() as { battle: BattleSummary; playerId: string };
    this.playerId = data.playerId;
    localStorage.setItem(STORAGE_KEYS.playerId, this.playerId);
    localStorage.setItem(STORAGE_KEYS.battleId, data.battle.id);
    this.currentBattle = data.battle;
    await this.startOnlineGame();
  }

  async startOnlineGame(): Promise<void> {
    const battleMapId = this.currentBattle?.mapId || this.selectedMapId;
    let mapWasRebuilt = false;
    if (battleMapId !== this.mapData.id) {
      await this.loadMapById(battleMapId, true);
      mapWasRebuilt = true;
    }
    this.applySelectedTankToLocal();
    if (!mapWasRebuilt) {
      await this.resetArena();
    }
    this.camera.setMode('chase');
    this.menu.classList.add('hidden');
    this.replay.classList.add('hidden');
    this.instructions.classList.add('hidden');
    this.status = 'playing';
    this.resume();
    requestAnimationFrame(() => {
      this.updateHeadingCompass();
      this.updateMinimap();
    });
    this.connectWebSocket();
  }

  connectWebSocket(): void {
    if (!this.currentBattle || this.webSocket) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const params = new URLSearchParams({
      battleId: this.currentBattle.id,
      playerId: this.playerId,
      nick: sanitizeNick(this.nickInput.value),
    });
    this.webSocket = new WebSocket(`${protocol}//${window.location.host}${this.webSocketPath}?${params}`);
    this.webSocket.onopen = () => this.syncLocalTank(true);
    this.webSocket.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      this.handleWsMessage(decodeMessage(event.data));
    };
    this.webSocket.onclose = () => {
      this.webSocket = null;
      this.setStatus('Disconnected');
    };
  }

  handleWsMessage(message: WsMessage): void {
    switch (message.type) {
      case WsMessageType.SetId:
        this.playerId = message.payload.id;
        this.currentBattle = message.payload.battle;
        this.syncLocalTank(true);
        this.setStatus(this.formatBattleStatus(message.payload.battle));
        break;
      case WsMessageType.BattleState:
        this.currentBattle = message.payload.battle;
        this.setStatus(this.formatBattleStatus(message.payload.battle));
        if (message.payload.battle.status === BattleStatus.Finished) {
          this.showBattleResult(message.payload.battle.winnerUid === this.playerId);
        }
        break;
      case WsMessageType.TanksData:
        this.syncRemoteTanks(message.payload.tanks);
        break;
      case WsMessageType.MinesData:
      case WsMessageType.ProjectilesData:
        break;
      case WsMessageType.DestructiblesData:
        this.applyDestroyedWalls(message.payload.destroyedSegmentIds);
        break;
    }
  }

  attachDestructionHooks(): void {
    this.bullets.forEach((bullet) => {
      bullet.onImpact ??= (impact) => this.applyAreaDamage(impact, bullet);
    });
  }

  applyAreaDamage(impact: BulletImpact, bullet: Bullet): void {
    const center = impact.position;
    const radius = Math.max(0, bullet.weapon?.splashRadius ?? 0);
    const minRatio = THREE.MathUtils.clamp(bullet.weapon?.splashMinDamageRatio ?? 0.2, 0, 1);
    let destroyedAnyWall = false;
    let destroyedAnyModelChunk = false;

    this.walls.forEach((wall) => {
      if (this.destroyedWallIds.has(wall.id) || wall.destroyed || wall.removed) {
        return;
      }

      const distance = wall === impact.wall ? 0 : this.distanceFromPointToObject(center, wall.mesh);
      const damage = this.areaDamageAtDistance(bullet.attack, distance, radius, minRatio);
      if (damage <= 0) {
        return;
      }

      const destroyed = wall.damage(damage);
      if (destroyed && this.recordDestroyedWall(wall)) {
        destroyedAnyWall = true;
      }
    });

    this.destructibleModels.forEach((model) => {
      const destroyedChunkIds = model.applyAreaDamage(
          center,
          bullet.attack,
          radius,
          minRatio,
          impact.destructibleModelHit?.model === model ? impact.destructibleModelHit.chunkId : undefined,
      );
      destroyedChunkIds.forEach((chunkId) => {
        if (this.destroyedModelChunkIds.has(chunkId)) {
          return;
        }
        this.destroyedModelChunkIds.add(chunkId);
        destroyedAnyModelChunk = true;
      });
    });

    this.tanks.forEach((tank) => {
      const distance = tank === impact.tank ? 0 : this.distanceFromPointToObject(center, tank.mesh);
      const damage = this.areaDamageAtDistance(bullet.attack, distance, radius, minRatio);
      if (damage <= 0) {
        return;
      }

      tank.GetAttacked(damage);
    });

    if (destroyedAnyWall || destroyedAnyModelChunk) {
      this.syncDestroyedWalls();
    }
  }

  areaDamageAtDistance(baseDamage: number, distance: number, radius: number, minRatio: number): number {
    if (distance <= 0) {
      return baseDamage;
    }
    if (radius <= 0 || distance > radius) {
      return 0;
    }

    const ratio = THREE.MathUtils.lerp(1, minRatio, distance / radius);
    return baseDamage * ratio;
  }

  distanceFromPointToObject(point: THREE.Vector3, object: THREE.Object3D): number {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) {
      return point.distanceTo(object.position);
    }

    return point.clone().clamp(box.min, box.max).distanceTo(point);
  }

  damageWall(wall: Wall, attack: number): void {
    if (this.destroyedWallIds.has(wall.id)) {
      return;
    }

    const destroyed = wall.damage(attack);
    if (!destroyed) {
      return;
    }

    this.recordDestroyedWall(wall);
    this.syncDestroyedWalls();
  }

  recordDestroyedWall(wall: Wall): boolean {
    if (this.destroyedWallIds.has(wall.id)) {
      return false;
    }

    this.destroyedWallIds.add(wall.id);
    this.queueWaterRebuild();
    return true;
  }

  applyDestroyedWalls(wallIds: string[]): void {
    wallIds.forEach((wallId) => {
      if (this.destroyedWallIds.has(wallId) || this.destroyedModelChunkIds.has(wallId)) {
        return;
      }
      if (this.applyDestroyedModelChunk(wallId)) {
        this.destroyedModelChunkIds.add(wallId);
        return;
      }
      if (this.isModelChunkId(wallId)) {
        this.destroyedModelChunkIds.add(wallId);
        return;
      }
      this.destroyedWallIds.add(wallId);
      const wall = this.walls.find((item) => item.id === wallId);
      if (!wall) {
        return;
      }
      wall.destroyed = true;
      wall.startDestroyAnimation();
      this.queueWaterRebuild();
    });
  }

  applyDestroyedModelChunk(chunkId: string): boolean {
    for (const model of this.destructibleModels) {
      if (model.removeChunk(chunkId)) {
        return true;
      }
    }

    return false;
  }

  isModelChunkId(id: string): boolean {
    return id.includes(':chunk-');
  }

  syncDestroyedWalls(): void {
    if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.webSocket.send(encodeMessage({
      type: ClientMessageType.UpdateDestroyedSegments,
      payload: {destroyedSegmentIds: [
        ...Array.from(this.destroyedWallIds),
        ...Array.from(this.destroyedModelChunkIds),
      ]},
    }));
  }

  syncRemoteTanks(tanks: NetworkTank[]): void {
    const activeIds = new Set<string>();
    tanks.forEach((tankData) => {
      if (!tankData.uid || tankData.uid === this.playerId) return;
      activeIds.add(tankData.uid);
      const tank = this.remoteTanks.get(tankData.uid) || this.createRemoteTank(tankData.uid, tankData.tankModelId);
      if (tankData.tankModelId && tank.tankModelId !== tankData.tankModelId) {
        const definition = getTankDefinition(tankData.tankModelId);
        Object.assign(tank, this.tankConfig(definition));
        tank.setTankModel(this.tankMeshFor(definition), definition);
      }
      applyNetworkTank(tank, tankData, this.arenaHalf);
      this.snapTankToTerrain(tank);
    });
    this.remoteTanks.forEach((tank, id) => {
      if (activeIds.has(id)) return;
      tank.destruct();
      this.remoteTanks.delete(id);
      this.tanks = this.tanks.filter((item) => item !== tank);
    });
  }

  syncLocalTank(force: boolean): void {
    if (!this.localTank || !this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    const tank = createNetworkTank(this.localTank, this.playerId, this.arenaHalf);
    const snapshot = `${tank.tankModelId}:${Math.round(tank.x)}:${Math.round(tank.y)}:${Math.round(tank.angle)}:${Math.round(tank.turretAngle ?? 0)}:${Math.round(tank.lives)}`;
    if (!force && snapshot === this.lastSentSnapshot && now - this.lastSentAt < 160) return;
    this.lastSentSnapshot = snapshot;
    this.lastSentAt = now;
    this.webSocket.send(encodeMessage({
      type: force ? ClientMessageType.AddTank : ClientMessageType.UpdateTank,
      payload: {tank},
    }));
  }

  showBattleResult(won: boolean): void {
    this.status = 'gameover';
    this.pause();
    (won ? this.playerWinBanner : this.playerLoseBanner).style.display = 'block';
  }

  setStatus(message: string): void {
    this.statusText.textContent = message;
  }

  formatBattleStatus(battle: BattleSummary): string {
    return `${battle.title} | ${battle.players.length}/${battle.maxPlayers} | ${battle.status}`;
  }
}

export {World};
