import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Scene } from "./system/Scene";
import { ThirdPersonViewCamera } from "./system/Camera";
import { Renderer } from "./system/Renderer";
import { Ground } from "./object/impl/Ground";
import { HemiSphereLight, DirectionalLight } from "./object/impl/lights";
import { Wall } from "./object/impl/Wall";
import {
  Powerup,
  HealthPowerup,
  WeaponPowerup,
  SpeedPowerup,
  AttackPowerup,
  DefensePowerup,
  PenetrationPowerup,
  GoalPowerup,
} from "./object/impl/powerups";
import { Tank } from "./object/impl/Tank";
import { Bullet } from "./object/impl/Bullet";
import { Loop } from "./system/Loop";
import type {
  BattleSummary,
  ClientMessage,
  GameConfig,
  Tank as NetworkTank,
  WsMessage,
} from "../../shared/types";
import { BattleStatus, ClientMessageType, WsMessageType } from "../../shared/types";

const ARENA_SIZE = 1500;
const ARENA_HALF = ARENA_SIZE / 2;
const STORAGE_KEYS = {
  nick: "tanks:nick",
  battleId: "tanks:battle-id",
  playerId: "tanks:player-id",
};

type KeyboardState = Record<string, number>;

const encodeMessage = (message: ClientMessage): string => JSON.stringify(message);
const decodeMessage = (message: string): WsMessage => JSON.parse(message) as WsMessage;

const createNetworkTank = (tank: Tank, uid: string | null, color = "#8ca36f"): NetworkTank => ({
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
  velocity: { x: 0, y: 0 },
  friction: 0.9,
  force: 100,
});

const applyNetworkTank = (tank: Tank, data: NetworkTank): void => {
  tank.mesh.position.set(data.x - ARENA_HALF, -(data.y - ARENA_HALF), 0);
  tank.mesh.rotation.z = THREE.MathUtils.degToRad(data.angle);
  tank.health = data.lives;
};

const sanitizeNick = (value: string): string => value.trim().slice(0, 24) || "Player";

class World {
  status = "menu";
  scene!: Scene;
  ground!: Ground;
  hemiLight!: HemiSphereLight;
  directLight!: DirectionalLight;
  walls: Wall[] = [];
  surrounding_walls: Wall[] = [];
  powerups: Powerup[] = [];
  tanks: Tank[] = [];
  remoteTanks = new Map<string, Tank>();
  bullets: Bullet[] = [];
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
  webSocketPath = "/ws";
  currentBattle: BattleSummary | null = null;
  playerId = localStorage.getItem(STORAGE_KEYS.playerId) || crypto.randomUUID();
  lastSentAt = 0;
  lastSentSnapshot = "";

  constructor() {
    localStorage.setItem(STORAGE_KEYS.playerId, this.playerId);
    this.sceneContainer = document.getElementById("scene-container") as HTMLElement;
    this.menu = document.getElementById("menu") as HTMLElement;
    this.replay = document.getElementById("replayMessage") as HTMLElement;
    this.instructions = document.getElementById("instructions") as HTMLElement;
    this.statusText = document.getElementById("battle-status-text") as HTMLElement;
    this.nickInput = document.getElementById("nick-input") as HTMLInputElement;
    this.battleTitleInput = document.getElementById("battle-title-input") as HTMLInputElement;
    this.maxPlayersInput = document.getElementById("max-players-input") as HTMLInputElement;
    this.battleIdInput = document.getElementById("battle-id-input") as HTMLInputElement;
    this.createButton = document.getElementById("create-battle-button") as HTMLButtonElement;
    this.joinButton = document.getElementById("join-battle-button") as HTMLButtonElement;
    this.healthContainer = document.getElementById("player1-container") as HTMLElement;
    this.playerWinBanner = document.getElementById("player1-win-banner") as HTMLElement;
    this.playerLoseBanner = document.getElementById("player1-lose-banner") as HTMLElement;
    this.init();
  }

  async init(): Promise<void> {
    this.nickInput.value = localStorage.getItem(STORAGE_KEYS.nick) || "";
    this.battleIdInput.value = localStorage.getItem(STORAGE_KEYS.battleId) || "";
    await this.loadGameConfig();
    await this.loadAssets();
    this.scene = new Scene();
    this.ground = new Ground("main", this.textureDict["ground"]);
    this.scene.add(this.ground);
    this.hemiLight = new HemiSphereLight("main");
    this.directLight = new DirectionalLight("main");
    this.scene.add(this.hemiLight);
    this.scene.add(this.directLight);
    this.initializeWalls(this.walls, this.surrounding_walls);
    this.walls.forEach((wall) => this.scene.add(wall));
    this.localTank = this.createPlayerTank("local");
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
    this.bgAudio.setBuffer(this.audioDict["Bgm"]).setVolume(0.01).setLoop(true);
    this.loop = new Loop(this.scene, [this.camera], [this.renderer]);
    this.registerBattleHandlers();
    this.registerInputHandlers();
    this.configureTicks();
    this.loop.start();
    this.pause();
    this.setStatus("Create or join a battle");
    window.dispatchEvent(new Event("resize"));
  }

  async loadGameConfig(): Promise<void> {
    const response = await fetch("/api/game-config").catch(() => null);
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

    const assetBase = "/battletanks";
    const [tankMesh, bulletMesh, powerupMesh] = await Promise.all([
      gltfPromise(`${assetBase}/tank_model_new/scene.gltf`),
      gltfPromise(`${assetBase}/bullet_model/scene.gltf`),
      gltfPromise(`${assetBase}/powerup_model/scene.gltf`),
    ]);
    this.meshDict["Tank"] = tankMesh.children[0].clone();
    this.meshDict["Bullet"] = bulletMesh.children[0].children[0].children[0].children[0].children[0].clone();
    this.meshDict["Powerup"] = powerupMesh.children[0].children[0].children[0].clone();

    const [powerupAudio, bulletHitAudio, explosionAudio, bgmAudio] = await Promise.all([
      audioPromise(`${assetBase}/audio/powerup.mp3`),
      audioPromise(`${assetBase}/audio/bullet_hit.mp3`),
      audioPromise(`${assetBase}/audio/explosion.mp3`),
      audioPromise(`${assetBase}/audio/bgm.mp3`),
    ]);
    this.audioDict["Powerup"] = powerupAudio;
    this.audioDict["Bullet_hit"] = bulletHitAudio;
    this.audioDict["Explosion"] = explosionAudio;
    this.audioDict["Bgm"] = bgmAudio;

    this.textureDict["ground"] = {};
    const groundBase = `${assetBase}/grassy-meadow1-bl/grassy-meadow1`;
    const [albedo, ao, height, metallic, normal, roughness] = await Promise.all([
      texturePromise(`${groundBase}_albedo.png`),
      texturePromise(`${groundBase}_ao.png`),
      texturePromise(`${groundBase}_height.png`),
      texturePromise(`${groundBase}_metallic.png`),
      texturePromise(`${groundBase}_normal-ogl.png`),
      texturePromise(`${groundBase}_roughness.png`),
    ]);
    this.textureDict["ground"] = { albedo, ao, height, metallic, normal, roughness };
    this.textureDict["wall"] = {};
  }

  createPlayerTank(name: string): Tank {
    return new Tank(name, this.meshDict["Tank"], this.meshDict["Bullet"], this.listeners, this.audioDict, {
      proceedUpKey: "KeyW",
      proceedDownKey: "KeyS",
      rotateLeftKey: "KeyA",
      rotateRightKey: "KeyD",
      firingKey: "Space",
    });
  }

  createRemoteTank(id: string): Tank {
    const tank = new Tank(`remote-${id}`, this.meshDict["Tank"], this.meshDict["Bullet"], this.listeners, this.audioDict, {
      firingKey: "__disabled__",
    });
    this.scene.add(tank);
    this.remoteTanks.set(id, tank);
    this.tanks.push(tank);
    return tank;
  }

  resetArena(): void {
    this.bullets.forEach((bullet) => bullet.destruct());
    this.bullets = [];
    this.powerups.forEach((powerup) => powerup.destruct());
    this.powerups = [];
    this.initializePowerups(this.powerups);
    this.powerups.forEach((powerup) => this.scene.add(powerup));
    this.localTank?.reset();
  }

  initializeWalls(walls: Wall[], surrounding_walls: Wall[]): void {
    const randomFactory = (seed: number): (() => number) => {
      let value = seed;
      return () => {
        value = (value * 1664525 + 1013904223) >>> 0;
        return value / 0x100000000;
      };
    };
    const mazeInitialize = (size: number, marginSize: number, textureDict: { [key: string]: THREE.Texture }) => {
      const gridCount = size * size;
      const hasWall = Array.from({ length: gridCount }, () => Array(gridCount).fill(false) as boolean[]);
      for (let i = 0; i < gridCount; i++) {
        if (i % size !== 0) hasWall[i][i - 1] = true;
        if (i % size !== size - 1) hasWall[i][i + 1] = true;
        if (i >= size) hasWall[i][i - size] = true;
        if (i < gridCount - size) hasWall[i][i + size] = true;
      }
      const visited = Array(gridCount).fill(false) as boolean[];
      const stack: number[] = [];
      const random = randomFactory(1337);
      let current = 0;
      visited[current] = true;
      while (true) {
        const options: number[] = [];
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
      const gridSize = marginSize / size;
      for (let i = 0; i < gridCount; i++) {
        for (let j = i + 1; j < gridCount; j++) {
          if (!hasWall[i][j]) continue;
          const position = new THREE.Vector3(0, 0, 0);
          const rotation = new THREE.Euler(0, 0, 0);
          if (j === i + 1) {
            position.x = -marginSize / 2 + gridSize * (j % size);
            position.y = marginSize / 2 - gridSize * (Math.floor(j / size) + 0.5);
          } else if (j === i + size) {
            position.x = -marginSize / 2 + gridSize * (j % size + 0.5);
            position.y = marginSize / 2 - gridSize * Math.floor(j / size);
            rotation.z = Math.PI / 2;
          }
          walls.push(new Wall("main", textureDict, new THREE.Vector3(20, gridSize + 20, 50), position, rotation));
        }
      }
    };

    const marginSize = ARENA_SIZE;
    mazeInitialize(8, marginSize, this.textureDict["wall"]);
    const wall1 = new Wall("main", this.textureDict["wall"], new THREE.Vector3(20, marginSize + 20, 100), new THREE.Vector3(marginSize / 2, 0, 0), new THREE.Euler(0, 0, 0));
    const wall2 = new Wall("main", this.textureDict["wall"], new THREE.Vector3(20, marginSize + 20, 100), new THREE.Vector3(-marginSize / 2, 0, 0), new THREE.Euler(0, 0, 0));
    const wall3 = new Wall("main", this.textureDict["wall"], new THREE.Vector3(20, marginSize - 200, 100), new THREE.Vector3(100, marginSize / 2, 0), new THREE.Euler(0, 0, Math.PI / 2));
    const wall4 = new Wall("main", this.textureDict["wall"], new THREE.Vector3(20, marginSize + 20, 100), new THREE.Vector3(0, -marginSize / 2, 0), new THREE.Euler(0, 0, Math.PI / 2));
    walls.push(wall1, wall2, wall3, wall4);
    surrounding_walls.push(wall1, wall2, wall3, wall4);
  }

  initializePowerups(powerups: Powerup[]): void {
    const mesh = this.meshDict["Powerup"];
    powerups.push(
      new HealthPowerup("main", mesh.children[9], new THREE.Vector3(300, 50, 15), this.listeners, this.audioDict["Powerup"]),
      new WeaponPowerup("main", mesh.children[1], new THREE.Vector3(-300, 50, 15), this.listeners, this.audioDict["Powerup"]),
      new SpeedPowerup("main", mesh.children[13], new THREE.Vector3(450, -450, 15), this.listeners, this.audioDict["Powerup"]),
      new AttackPowerup("main", mesh.children[2], new THREE.Vector3(50, -100, 15), this.listeners, this.audioDict["Powerup"]),
      new DefensePowerup("main", mesh.children[0], new THREE.Vector3(50, 50, 15), this.listeners, this.audioDict["Powerup"]),
      new PenetrationPowerup("main", mesh.children[11], new THREE.Vector3(-300, -300, 15), this.listeners, this.audioDict["Powerup"]),
      new GoalPowerup("main", mesh.children[3], new THREE.Vector3(-750, 800, 15), this.listeners, this.audioDict["Powerup"]),
    );
  }

  configureTicks(): void {
    this.loop.updatableLists.push([this.localTank], this.powerups, this.bullets);
    Tank.onTick = (tank: Tank, delta: number) => {
      if (tank !== this.localTank) return;
      tank.update(this.keyboard, this.scene, this.tanks, this.walls, this.surrounding_walls, this.bullets, delta);
      this.syncLocalTank(false);
    };
    Bullet.onTick = (bullet: Bullet, delta: number) => {
      bullet.update(this.ground, this.bullets, this.walls, this.tanks, delta);
    };
    Powerup.onTick = (powerup: Powerup) => {
      powerup.update(this.powerups, this.localTank ? [this.localTank] : [], this.walls);
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
    this.loop.updatableLists = [[this.localTank], this.powerups, this.bullets].filter(Boolean);
  }

  registerBattleHandlers(): void {
    this.nickInput.addEventListener("input", () => {
      localStorage.setItem(STORAGE_KEYS.nick, sanitizeNick(this.nickInput.value));
    });
    this.createButton.addEventListener("click", () => {
      void this.createBattle();
    });
    this.joinButton.addEventListener("click", () => {
      void this.joinBattle(this.battleIdInput.value);
    });
  }

  registerInputHandlers(): void {
    window.addEventListener("keydown", (event) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
        event.preventDefault();
      }
      this.keyboard[event.code] = 1;
      if (event.code === "ArrowUp") this.keyboard.KeyW = 1;
      if (event.code === "ArrowDown") this.keyboard.KeyS = 1;
      if (event.code === "ArrowLeft") this.keyboard.KeyA = 1;
      if (event.code === "ArrowRight") this.keyboard.KeyD = 1;
    });
    window.addEventListener("keyup", (event) => {
      this.keyboard[event.code] = 0;
      if (event.code === "ArrowUp") this.keyboard.KeyW = 0;
      if (event.code === "ArrowDown") this.keyboard.KeyS = 0;
      if (event.code === "ArrowLeft") this.keyboard.KeyA = 0;
      if (event.code === "ArrowRight") this.keyboard.KeyD = 0;
    });
    window.addEventListener("resize", () => {
      this.camera.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.camera.updateProjectionMatrix();
      this.renderer.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.renderer.setPixelRatio(window.devicePixelRatio);
    });
  }

  async createBattle(): Promise<void> {
    this.setStatus("Creating battle...");
    const response = await fetch("/api/battles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nick: sanitizeNick(this.nickInput.value),
        playerId: this.playerId,
        title: this.battleTitleInput.value.trim() || "BattleTanks arena",
        maxPlayers: Number(this.maxPlayersInput.value) || 4,
      }),
    });
    if (!response.ok) {
      this.setStatus("Could not create battle");
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
      this.setStatus("Paste battle UUID first");
      return;
    }
    this.setStatus("Joining battle...");
    const response = await fetch(`/api/battles/${encodeURIComponent(battleId)}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nick: sanitizeNick(this.nickInput.value),
        playerId: this.playerId,
      }),
    });
    if (!response.ok) {
      this.setStatus("Could not join battle");
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
    this.menu.classList.add("hidden");
    this.replay.classList.add("hidden");
    this.instructions.classList.add("hidden");
    this.status = "playing";
    this.resume();
    this.connectWebSocket();
  }

  connectWebSocket(): void {
    if (!this.currentBattle || this.webSocket) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const params = new URLSearchParams({
      battleId: this.currentBattle.id,
      playerId: this.playerId,
      nick: sanitizeNick(this.nickInput.value),
    });
    this.webSocket = new WebSocket(`${protocol}//${window.location.host}${this.webSocketPath}?${params}`);
    this.webSocket.onopen = () => this.syncLocalTank(true);
    this.webSocket.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      this.handleWsMessage(decodeMessage(event.data));
    };
    this.webSocket.onclose = () => {
      this.webSocket = null;
      this.setStatus("Disconnected");
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
      case WsMessageType.DestructiblesData:
        break;
    }
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
      payload: { tank },
    }));
  }

  showBattleResult(won: boolean): void {
    this.status = "gameover";
    this.pause();
    (won ? this.playerWinBanner : this.playerLoseBanner).style.display = "block";
  }

  setStatus(message: string): void {
    this.statusText.textContent = message;
  }

  formatBattleStatus(battle: BattleSummary): string {
    return `${battle.title} | ${battle.players.length}/${battle.maxPlayers} | ${battle.status}`;
  }
}

export { World };
