import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import type {BattleSummary, ClientMessage, GameConfig, Tank as NetworkTank, WsMessage} from '../../shared/types';
import {BattleStatus, ClientMessageType, WsMessageType} from '../../shared/types';
import {Bullet} from './object/impl/Bullet';
import {Ground} from './object/impl/Ground';
import {DirectionalLight} from './object/impl/Light/DirectionalLight';
import {HemiSphereLight} from './object/impl/Light/HemiSphereLight';
import {SkyDome} from './object/impl/Light/SkyDome';
import {PenetrationPowerup} from './object/impl/Powerups/PenetrationPowerup';
import {AttackPowerup} from './object/impl/Powerups/AttackPowerup';
import {DefensePowerup} from './object/impl/Powerups/DefensePowerup';
import {GoalPowerup} from './object/impl/powerups/GoalPowerup';
import {HealthPowerup} from './object/impl/powerups/HealthPowerup';
import {Powerup} from './object/impl/Powerups/Powerup';
import {SpeedPowerup} from './object/impl/Powerups/SpeedPowerup';
import {WeaponPowerup} from './object/impl/Powerups/WeaponPowerup';
import {Tank} from './object/impl/Tank';
import {Wall} from './object/impl/Wall';
import {ThirdPersonViewCamera} from './system/Camera/ThirdPersonViewCamera';
import {Loop} from './system/Loop';
import {Renderer} from './system/Renderer';
import {Scene} from './system/Scene';
import defaultMapData from '../../assets/maps/default.json';

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
  walls: BoundaryWallData[];
};

const DEFAULT_MAP = defaultMapData as unknown as GameMapData;
const ARENA_SIZE = DEFAULT_MAP.arena.size;
const ARENA_HALF = ARENA_SIZE / 2;
const STORAGE_KEYS = {
  nick: 'tanks:nick',
  battleId: 'tanks:battle-id',
  playerId: 'tanks:player-id',
};

type KeyboardState = Record<string, number>;

const encodeMessage = (message: ClientMessage): string => JSON.stringify(message);
const decodeMessage = (message: string): WsMessage => JSON.parse(message) as WsMessage;

const createNetworkTank = (tank: Tank, uid: string | null, color = '#8ca36f'): NetworkTank => ({
  uid,
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
  sceneContainer: HTMLElement;
  menu: HTMLElement;
  replay: HTMLElement;
  instructions: HTMLElement;
  statusText: HTMLElement;
  nickInput: HTMLInputElement;
  battleTitleInput: HTMLInputElement;
  maxPlayersInput: HTMLInputElement;
  battleIdInput: HTMLInputElement;
  createButton: HTMLButtonElement;
  joinButton: HTMLButtonElement;
  healthContainer: HTMLElement;
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
    this.createButton = document.getElementById('create-battle-button') as HTMLButtonElement;
    this.joinButton = document.getElementById('join-battle-button') as HTMLButtonElement;
    this.healthContainer = document.getElementById('player1-container') as HTMLElement;
    this.playerWinBanner = document.getElementById('player1-win-banner') as HTMLElement;
    this.playerLoseBanner = document.getElementById('player1-lose-banner') as HTMLElement;
    this.init();
  }

  async init(): Promise<void> {
    this.nickInput.value = localStorage.getItem(STORAGE_KEYS.nick) || '';
    this.battleIdInput.value = localStorage.getItem(STORAGE_KEYS.battleId) || '';
    await this.loadGameConfig();
    await this.loadAssets();
    this.scene = new Scene();
    this.skyDome = new SkyDome('main');
    this.scene.add(this.skyDome);
    this.ground = new Ground('main', this.textureDict['ground']);
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

  async loadAssets(): Promise<void> {
    const gltfLoader = new GLTFLoader();
    const gltfPromise = (path: string): Promise<THREE.Group> => (
        new Promise((resolve, reject) => {
          gltfLoader.load(path, (gltf) => resolve(gltf.scene), undefined, reject);
        })
    );
    const audioLoader = new THREE.AudioLoader();
    const audioPromise = (path: string): Promise<AudioBuffer> => (
        new Promise((resolve, reject) => {
          audioLoader.load(path, resolve, undefined, reject);
        })
    );
    const textureLoader = new THREE.TextureLoader();
    const texturePromise = (path: string): Promise<THREE.Texture> => (
        new Promise((resolve, reject) => {
          textureLoader.load(path, resolve, undefined, reject);
        })
    );

    const assetBase = '/battletanks';
    const [tankMesh, bulletMesh, powerupMesh] = await Promise.all([
      gltfPromise(`${assetBase}/tank_model_new/scene.gltf`),
      gltfPromise(`${assetBase}/bullet_model/scene.gltf`),
      gltfPromise(`${assetBase}/powerup_model/scene.gltf`),
    ]);
    this.meshDict['Tank'] = tankMesh.children[0].clone();
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
    const wallAlbedo = await texturePromise(wallTextureUrls['../../assets/textures/brick/tx.png']);
    wallAlbedo.colorSpace = THREE.SRGBColorSpace;
    wallAlbedo.wrapS = THREE.RepeatWrapping;
    wallAlbedo.wrapT = THREE.RepeatWrapping;

    const damagedWallUrl = wallTextureUrls['../../assets/textures/brick/tx_damaged.png'];
    const damagedAlbedo = damagedWallUrl ? await texturePromise(damagedWallUrl) : undefined;
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

  createPlayerTank(name: string): Tank {
    return new Tank(name, this.meshDict['Tank'], this.meshDict['Bullet'], this.listeners, this.audioDict, {
      proceedUpKey: 'KeyW',
      proceedDownKey: 'KeyS',
      rotateLeftKey: 'KeyA',
      rotateRightKey: 'KeyD',
      firingKey: 'Space',
    });
  }

  createRemoteTank(id: string): Tank {
    const tank = new Tank(`remote-${id}`, this.meshDict['Tank'], this.meshDict['Bullet'], this.listeners, this.audioDict, {
      firingKey: '__disabled__',
    });
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
      const wallBaseZ = wallData.position[2];

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
        new HealthPowerup('main', mesh.children[9], new THREE.Vector3(300, 50, 15), this.listeners, this.audioDict['Powerup']),
        new WeaponPowerup('main', mesh.children[1], new THREE.Vector3(-300, 50, 15), this.listeners, this.audioDict['Powerup']),
        new SpeedPowerup('main', mesh.children[13], new THREE.Vector3(450, -450, 15), this.listeners, this.audioDict['Powerup']),
        new AttackPowerup('main', mesh.children[2], new THREE.Vector3(50, -100, 15), this.listeners, this.audioDict['Powerup']),
        new DefensePowerup('main', mesh.children[0], new THREE.Vector3(50, 50, 15), this.listeners, this.audioDict['Powerup']),
        new PenetrationPowerup('main', mesh.children[11], new THREE.Vector3(-300, -300, 15), this.listeners, this.audioDict['Powerup']),
        new GoalPowerup('main', mesh.children[3], new THREE.Vector3(-750, 800, 15), this.listeners, this.audioDict['Powerup']),
    );
  }

  configureTicks(): void {
    this.loop.updatableLists.push([this.localTank], this.powerups, this.bullets, this.walls);
    Tank.onTick = (tank: Tank, delta: number) => {
      if (tank !== this.localTank) return;
      tank.update(this.keyboard, this.scene, this.tanks, this.walls, this.surrounding_walls, this.bullets, delta);
      this.updateCrosshairPosition();
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
    this.resetArena();
    this.menu.classList.add('hidden');
    this.replay.classList.add('hidden');
    this.instructions.classList.add('hidden');
    this.status = 'playing';
    this.resume();
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
      const tank = this.remoteTanks.get(tankData.uid) || this.createRemoteTank(tankData.uid);
      applyNetworkTank(tank, tankData);
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
    const snapshot = `${Math.round(tank.x)}:${Math.round(tank.y)}:${Math.round(tank.angle)}:${Math.round(tank.lives)}`;
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
