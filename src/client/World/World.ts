import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MTLLoader} from 'three/examples/jsm/loaders/MTLLoader.js';
import {OBJLoader} from 'three/examples/jsm/loaders/OBJLoader.js';
import defaultMapData from '../../assets/maps/default.json';
import type {BattleSummary, ClientMessage, GameConfig, Tank as NetworkTank, WsMessage} from '../../shared/types';
import {BattleStatus, ClientMessageType, WsMessageType} from '../../shared/types';
import {Bullet} from './object/impl/Bullet';
import {Ground, type TerrainData} from './object/impl/Ground';
import {DirectionalLight} from './object/impl/Light/DirectionalLight';
import {HemiSphereLight} from './object/impl/Light/HemiSphereLight';
import {SkyDome} from './object/impl/Light/SkyDome';
import {AttackPowerup} from './object/impl/Powerups/AttackPowerup';
import {DefensePowerup} from './object/impl/Powerups/DefensePowerup';
import {GoalPowerup} from './object/impl/powerups/GoalPowerup';
import {HealthPowerup} from './object/impl/powerups/HealthPowerup';
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

type VectorTuple = [number, number, number];
type BoundaryWallData = {
  id: string;
  kind: 'maze' | 'boundary';
  size: VectorTuple;
  position: VectorTuple;
  rotation: VectorTuple;
  destructible: boolean;
  health?: number;
};
type GameMapData = {
  id: string;
  name: string;
  arena: {
    size: number;
  };
  generator: {
    type: string;
    gridSize: number;
    seed: number;
    wall: Record<string, number>;
  };
  terrain?: TerrainData;
  walls: BoundaryWallData[];
};

const DEFAULT_MAP = defaultMapData as unknown as GameMapData;
const ARENA_SIZE = DEFAULT_MAP.arena.size;
const ARENA_HALF = ARENA_SIZE / 2;
const STORAGE_KEYS = {
  nick: 'tanks:nick',
  battleId: 'tanks:battle-id',
  playerId: 'tanks:player-id',
  tankModelId: 'tanks:tank-model-id',
};

type KeyboardState = Record<string, number>;

const encodeMessage = (message: ClientMessage): string => JSON.stringify(message);
const decodeMessage = (message: string): WsMessage => JSON.parse(message) as WsMessage;

const createNetworkTank = (tank: Tank, uid: string | null, color = '#8ca36f'): NetworkTank => ({
  uid,
  tankModelId: tank.tankModelId,
  turretAngle: THREE.MathUtils.radToDeg(tank.mesh.rotation.z + tank.aimYaw),
  lives: Math.max(0, tank.health),
  x: tank.mesh.position.x + ARENA_HALF,
  y: -tank.mesh.position.y + ARENA_HALF,
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

const applyNetworkTank = (tank: Tank, data: NetworkTank): void => {
  tank.mesh.position.set(data.x - ARENA_HALF, -(data.y - ARENA_HALF), 0);
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
  powerups: Powerup[] = [];
  tanks: Tank[] = [];
  remoteTanks = new Map<string, Tank>();
  bullets: Bullet[] = [];
  destroyedWallIds = new Set<string>();
  occludedWallIds = new Set<string>();
  sceneContainer: HTMLElement;
  menu: HTMLElement;
  replay: HTMLElement;
  instructions: HTMLElement;
  statusText: HTMLElement;
  nickInput: HTMLInputElement;
  battleTitleInput: HTMLInputElement;
  maxPlayersInput: HTMLInputElement;
  battleIdInput: HTMLInputElement;
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
    this.battleTitleInput = document.getElementById('battle-title-input') as HTMLInputElement;
    this.maxPlayersInput = document.getElementById('max-players-input') as HTMLInputElement;
    this.battleIdInput = document.getElementById('battle-id-input') as HTMLInputElement;
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
    await this.loadAssets();
    this.scene = new Scene();
    this.skyDome = new SkyDome('main');
    this.scene.add(this.skyDome);
    this.ground = new Ground('main', this.textureDict['ground'], ARENA_SIZE, DEFAULT_MAP.terrain ?? {resolution: 96, features: []});
    this.scene.add(this.ground);
    this.hemiLight = new HemiSphereLight('main');
    this.directLight = new DirectionalLight('main');
    this.scene.add(this.hemiLight);
    this.scene.add(this.directLight);
    this.initializeWalls(this.walls, this.surrounding_walls);
    this.walls.forEach((wall) => this.scene.add(wall));
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
    const optionalTexturePromise = async (path: string | undefined): Promise<THREE.Texture | undefined> => {
      if (!path) {
        return undefined;
      }

      return texturePromise(path);
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

    const wallTextureUrls = import.meta.glob('../../assets/textures/brick/*.png', {
      eager: true,
      query: '?url',
      import: 'default',
    }) as Record<string, string>;
    const wallAlbedo = await texturePromise(
        wallTextureUrls['../../assets/textures/brick/tx.png'],
        createFallbackBrickTexture(),
    );
    wallAlbedo.colorSpace = THREE.SRGBColorSpace;
    wallAlbedo.wrapS = THREE.RepeatWrapping;
    wallAlbedo.wrapT = THREE.RepeatWrapping;

    const damagedWallUrl = wallTextureUrls['../../assets/textures/brick/tx_damaged.png'];
    const damagedAlbedo = await optionalTexturePromise(damagedWallUrl);
    if (damagedAlbedo) {
      damagedAlbedo.colorSpace = THREE.SRGBColorSpace;
      damagedAlbedo.wrapS = THREE.RepeatWrapping;
      damagedAlbedo.wrapT = THREE.RepeatWrapping;
    }

    const destroyAlbedos = await Promise.all(
        [1, 2, 3]
            .map((frame) => ({
              frame,
              url: wallTextureUrls[`../../assets/textures/brick/tx_destroy-${frame}.png`],
            }))
            .filter((entry): entry is { frame: number; url: string } => Boolean(entry.url))
            .map(async ({frame, url}) => {
              const texture = await texturePromise(url);
              texture.colorSpace = THREE.SRGBColorSpace;
              texture.wrapS = THREE.RepeatWrapping;
              texture.wrapT = THREE.RepeatWrapping;
              return {frame, texture};
            }),
    );

    this.textureDict['wall'] = {albedo: wallAlbedo};
    if (damagedAlbedo) {
      this.textureDict['wall'].damagedAlbedo = damagedAlbedo;
    }
    destroyAlbedos.forEach(({frame, texture}) => {
      this.textureDict['wall'][`destroyAlbedo${frame}`] = texture;
    });
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

  snapTankToTerrain(tank: Tank): void {
    tank.mesh.position.z = this.ground.heightAt(tank.mesh.position.x, tank.mesh.position.y);
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
    this.snapTankToTerrain(tank);
    return tank;
  }

  createRemoteTank(id: string, tankModelId = DEFAULT_TANK_ID): Tank {
    const definition = getTankDefinition(tankModelId);
    const tank = new Tank(`remote-${id}`, this.tankMeshFor(definition), this.meshDict['Bullet'], this.listeners, this.audioDict, {
      ...this.tankConfig(definition),
      firingKey: '__disabled__',
    });
    this.snapTankToTerrain(tank);
    this.scene.add(tank);
    this.remoteTanks.set(id, tank);
    this.tanks.push(tank);
    return tank;
  }

  resetArena(): void {
    this.bullets.forEach((bullet) => bullet.destruct());
    this.bullets = [];
    this.walls.forEach((wall) => wall.destruct());
    this.walls = [];
    this.surrounding_walls = [];
    this.destroyedWallIds.clear();
    this.occludedWallIds.clear();
    this.initializeWalls(this.walls, this.surrounding_walls);
    this.walls.forEach((wall) => this.scene.add(wall));
    this.powerups.forEach((powerup) => powerup.destruct());
    this.powerups = [];
    this.initializePowerups(this.powerups);
    this.powerups.forEach((powerup) => this.scene.add(powerup));
    this.localTank?.reset();
  }

  initializeWalls(walls: Wall[], surrounding_walls: Wall[]): void {
    const mapData = DEFAULT_MAP;
    const mapWallTexture = this.textureDict['wall'];
    const maxWallBlockHeight = mapData.generator.wall.maxBlockHeight ?? 50;

    mapData.walls.forEach((wallData) => {
      const heightBlockCount = Math.max(1, Math.ceil(wallData.size[2] / maxWallBlockHeight));
      const blockHeight = wallData.size[2] / heightBlockCount;
      const wallBaseZ = wallData.position[2] + this.ground.heightAt(wallData.position[0], wallData.position[1]);

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
              destructible: wallData.destructible,
              health: wallData.health,
            },
        );
        walls.push(wall);
        if (wallData.kind === 'boundary') {
          surrounding_walls.push(wall);
        }
      }
    });
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
      tank.update(this.keyboard, this.scene, this.ground, this.tanks, this.walls, this.surrounding_walls, this.bullets, delta);
      this.snapTankToTerrain(tank);
      this.updateCrosshairPosition();
      this.updateLocalOcclusionFade();
      this.updateMinimap();
      this.attachDestructionHooks();
      this.syncLocalTank(false);
    };
    Bullet.onTick = (bullet: Bullet, delta: number) => {
      bullet.update(this.ground, this.bullets, this.walls, this.tanks, delta);
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
    const raycaster = new THREE.Raycaster(origin, direction, 0, ARENA_SIZE * 2);
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
      if (distanceToGround > 0 && distanceToGround <= ARENA_SIZE * 2) {
        return groundHit;
      }
    }

    return origin.clone().add(direction.multiplyScalar(ARENA_SIZE));
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

    const padding = 14;
    const topPadding = 30;
    const mapSize = Math.max(1, Math.min(cssWidth - padding * 2, cssHeight - padding - topPadding));
    const mapLeft = (cssWidth - mapSize) / 2;
    const mapTop = topPadding;
    const scale = mapSize / ARENA_SIZE;
    const toMap = (position: THREE.Vector3): { x: number; y: number } => ({
      x: mapLeft + (position.x + ARENA_HALF) * scale,
      y: mapTop + (ARENA_HALF - position.y) * scale,
    });

    context.fillStyle = 'rgba(32, 48, 28, 0.92)';
    context.fillRect(mapLeft, mapTop, mapSize, mapSize);
    context.strokeStyle = 'rgba(215, 230, 92, 0.38)';
    context.lineWidth = 1;
    context.strokeRect(mapLeft + 0.5, mapTop + 0.5, mapSize - 1, mapSize - 1);

    context.save();
    context.beginPath();
    context.rect(mapLeft, mapTop, mapSize, mapSize);
    context.clip();

    context.strokeStyle = 'rgba(215, 230, 92, 0.08)';
    context.lineWidth = 1;
    const gridStep = mapSize / 5;
    for (let index = 1; index < 5; index += 1) {
      const offset = mapLeft + index * gridStep;
      context.beginPath();
      context.moveTo(offset, mapTop);
      context.lineTo(offset, mapTop + mapSize);
      context.stroke();

      const y = mapTop + index * gridStep;
      context.beginPath();
      context.moveTo(mapLeft, y);
      context.lineTo(mapLeft + mapSize, y);
      context.stroke();
    }

    this.drawMinimapWalls(context, toMap, scale);
    this.remoteTanks.forEach((tank) => this.drawMinimapTank(context, tank, toMap, '#ff6048', 4.5));
    this.drawMinimapTank(context, this.localTank, toMap, '#d7ff58', 5.5);

    context.restore();
    context.restore();
  }

  drawMinimapWalls(
      context: CanvasRenderingContext2D,
      toMap: (position: THREE.Vector3) => { x: number; y: number },
      scale: number,
  ): void {
    context.fillStyle = 'rgba(226, 224, 194, 0.24)';
    this.walls.forEach((wall) => {
      if (wall.destroyed || !wall.mesh.parent) {
        return;
      }

      const point = toMap(wall.mesh.position);
      context.save();
      context.translate(point.x, point.y);
      context.rotate(-wall.mesh.rotation.z);
      context.fillRect(
          -wall.size.x * scale / 2,
          -wall.size.y * scale / 2,
          Math.max(1, wall.size.x * scale),
          Math.max(1, wall.size.y * scale),
      );
      context.restore();
    });
  }

  drawMinimapTank(
      context: CanvasRenderingContext2D,
      tank: Tank,
      toMap: (position: THREE.Vector3) => { x: number; y: number },
      color: string,
      radius: number,
  ): void {
    const point = toMap(tank.mesh.position);
    const heading = -tank.mesh.rotation.z;
    const aimHeading = -(tank.mesh.rotation.z + tank.aimYaw);

    context.save();
    context.translate(point.x, point.y);
    context.rotate(heading);
    context.fillStyle = color;
    context.strokeStyle = 'rgba(4, 8, 5, 0.86)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, -radius - 3);
    context.lineTo(radius + 3, radius + 3);
    context.lineTo(0, radius);
    context.lineTo(-radius - 3, radius + 3);
    context.closePath();
    context.fill();
    context.stroke();
    context.restore();

    context.save();
    context.translate(point.x, point.y);
    context.rotate(aimHeading);
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(0, -radius * 2.5);
    context.stroke();
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
    const armor = Math.round(stats.defense * 100);
    const reload = (stats.fireCooldownMs / 1000).toFixed(1);
    const turret = stats.hasRotatingTurret ? `${stats.turretTraverseDegPerSecond}°/s turret` : 'fixed gun';
    return `HP ${stats.maxHealth} • Armor ${armor}% • Speed ${stats.moveSpeed} • DMG ${stats.bulletDamage} • ${reload}s reload • ${turret}`;
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
    this.createButton.addEventListener('click', () => {
      void this.createBattle();
    });
    this.joinButton.addEventListener('click', () => {
      void this.joinBattle(this.battleIdInput.value);
    });
  }

  registerInputHandlers(): void {
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Escape' && !this.tankModal.classList.contains('hidden')) {
        this.closeTankModal(false);
        return;
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyQ', 'KeyE'].includes(event.code)) {
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
      this.updateMinimap();
    });
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
    this.startOnlineGame();
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
    this.startOnlineGame();
  }

  startOnlineGame(): void {
    this.applySelectedTankToLocal();
    this.resetArena();
    this.menu.classList.add('hidden');
    this.replay.classList.add('hidden');
    this.instructions.classList.add('hidden');
    this.status = 'playing';
    this.resume();
    requestAnimationFrame(() => this.updateMinimap());
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
      bullet.onWallHit ??= (wall) => this.damageWall(wall, bullet.attack);
    });
  }

  damageWall(wall: Wall, attack: number): void {
    if (this.destroyedWallIds.has(wall.id)) {
      return;
    }

    const destroyed = wall.damage(attack);
    if (!destroyed) {
      return;
    }

    this.destroyedWallIds.add(wall.id);
    this.syncDestroyedWalls();
  }

  applyDestroyedWalls(wallIds: string[]): void {
    wallIds.forEach((wallId) => {
      if (this.destroyedWallIds.has(wallId)) {
        return;
      }
      this.destroyedWallIds.add(wallId);
      const wall = this.walls.find((item) => item.id === wallId);
      if (!wall) {
        return;
      }
      wall.destroyed = true;
      wall.startDestroyAnimation();
    });
  }

  syncDestroyedWalls(): void {
    if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.webSocket.send(encodeMessage({
      type: ClientMessageType.UpdateDestroyedSegments,
      payload: {destroyedSegmentIds: Array.from(this.destroyedWallIds)},
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
      applyNetworkTank(tank, tankData);
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
    const tank = createNetworkTank(this.localTank, this.playerId);
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
