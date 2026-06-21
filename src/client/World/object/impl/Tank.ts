import * as THREE from 'three';
import {Scene} from '../../system/Scene';
import type {TankDefinition} from '../../tank-definitions/shared/tank-definition.type';
import {checkCollisionTankWithTank, checkCollisionTankWithWall} from '../../utils/collision';
import {PBar} from '../../utils/PBar';
import {MovableObject} from '../MovableObject';
import {Bullet} from './Bullet';
import {TankModel} from './TankModel';
import {Wall} from './Wall';

export class Tank extends MovableObject {
  mesh: THREE.Group;
  aimAnchor: THREE.Group;
  tankDefinition: TankDefinition | null = null;
  tankModel: TankModel | null = null;
  tankModelId = 'vanguard';
  bboxParameter = {width: 30, height: 50, depth: 30};
  health: number = 100;
  maxHealth: number = 100;

  // bullet configuration
  bulletLocalPos: THREE.Vector3 = new THREE.Vector3(0, 65, 18);
  bulletLocalDir: THREE.Vector3 = new THREE.Vector3(0, 1, 0);
  bulletSpeed: number = 680;
  fireCooldownMs: number = 420;

  // key bindings
  proceedUpKey: string = 'KeyW';
  proceedDownKey: string = 'KeyS';
  rotateLeftKey: string = 'KeyA';
  rotateRightKey: string = 'KeyD';
  firingKey: string = 'Space';
  aimUpKey: string = 'KeyE';
  aimDownKey: string = 'KeyQ';

  // keyboard control variables
  proceed: number = 0;
  rotate: number = 0;
  aimInput: number = 0;
  aimYaw: number = 0;
  aimPitch: number = 0;
  aimPitchMin: number = THREE.MathUtils.degToRad(-12);
  aimPitchMax: number = THREE.MathUtils.degToRad(28);
  aimYawSpeed: number = THREE.MathUtils.degToRad(72);
  aimPitchSpeed: number = THREE.MathUtils.degToRad(42);
  hasRotatingTurret: boolean = true;
  lastFireTime: number = 0;
  firingKeyPressed: boolean = false;

  // other assets
  bullet_mesh!: THREE.Object3D;
  listeners!: THREE.AudioListener[];
  audio!: { [key: string]: AudioBuffer };

  originalColor: THREE.Color = new THREE.Color(0xffffff);
  originalPos: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  originalRot: THREE.Euler = new THREE.Euler(0, 0, 0);

  healthElement!: HTMLElement;
  healthBarFillElement!: HTMLElement;
  healthBarValueElement!: HTMLElement;
  powerupsContainerElement!: HTMLElement;
  aimPitchElement!: HTMLElement;
  crosshairElement!: HTMLElement;

  // poweup is responsible for creating powerup pbar elements and hooks
  // tank tick is responsible for checking if the powerup is expired and remove it
  powerups: { [key: string]: PBar } = {};
  powerupPostHooks: { [key: string]: (tank: Tank) => void } = {};

  // powerup related state variables
  attack: number = 10;
  defense: number = 0;
  bulletUpgraded: boolean = false;
  penetrationUpgraded: boolean = false;
  penetrationPermitted: boolean = false;
  proceedSpeed: number = 100;
  rotateSpeed: number = 1;

  constructor(name: string, tank_mesh: THREE.Object3D | null,
              bullet_mesh: THREE.Object3D | null, listeners: THREE.AudioListener[] | null,
              audio: { [key: string]: AudioBuffer } | null, config: Partial<Tank> = {}) {
    super('tank', name);
    Object.assign(this, config);

    this.mesh = new THREE.Group();
    this.aimAnchor = new THREE.Group();
    this.mesh.add(this.aimAnchor);
    if (tank_mesh != null) {
      this.setTankModel(tank_mesh);
      this.mesh.castShadow = true;
      this.mesh.receiveShadow = true;
      this.mesh.position.set(625, -625, 0);
    }

    this.originalPos = this.mesh.position.clone();
    this.originalRot = this.mesh.rotation.clone();

    if (listeners != null) {
      this.listeners = listeners;
    }
    if (audio != null) {
      this.audio = audio;
    }

    if (bullet_mesh != null) {
      this.bullet_mesh = bullet_mesh.clone();
    }
  }

  setTankModel(sourceMesh: THREE.Object3D, definition = this.tankDefinition): void {
    if (!definition) {
      return;
    }

    if (this.tankModel) {
      this.tankModel.root.parent?.remove(this.tankModel.root);
      this.tankModel.dispose();
    }

    this.tankDefinition = definition;
    this.tankModelId = definition.id;
    this.tankModel = new TankModel(sourceMesh, definition);
    this.mesh.add(this.tankModel.root);
    this.bboxParameter = {...this.tankModel.metrics.bboxParameter};
    this.bulletLocalPos.copy(this.tankModel.metrics.bulletLocalPos);
    this.originalColor.copy(this.tankModel.originalColor);
    this.applyDefinitionStats(definition, true);
  }

  applyDefinitionStats(definition = this.tankDefinition, preserveHealth = false): void {
    if (!definition) {
      return;
    }

    const {stats} = definition;
    this.maxHealth = stats.maxHealth;
    this.health = preserveHealth ? Math.min(this.health, this.maxHealth) : this.maxHealth;
    this.attack = stats.bulletDamage;
    this.defense = stats.defense;
    this.proceedSpeed = stats.moveSpeed;
    this.rotateSpeed = stats.turnSpeed;
    this.bulletSpeed = stats.bulletSpeed;
    this.fireCooldownMs = stats.fireCooldownMs;
    this.hasRotatingTurret = stats.hasRotatingTurret;
    this.aimYawSpeed = THREE.MathUtils.degToRad(stats.turretTraverseDegPerSecond);
    this.aimPitchSpeed = THREE.MathUtils.degToRad(stats.aimPitchDegPerSecond);
    if (!this.hasRotatingTurret) {
      this.setAimYaw(0);
    }
  }

  post_init(container_sub: HTMLElement) {
    this.healthElement = container_sub.getElementsByClassName('health')[0] as HTMLElement;
    this.healthBarFillElement = container_sub.getElementsByClassName('health__bar__fill')[0] as HTMLElement;
    this.healthBarValueElement = container_sub.getElementsByClassName('health__value')[0] as HTMLElement;
    // this.weaponBarFillElement = container_sub.getElementsByClassName("weapon__bar__fill")[0] as HTMLElement;
    // this.weaponBarValueElement = container_sub.getElementsByClassName("weapon__value")[0] as HTMLElement;
    this.powerupsContainerElement = container_sub.getElementsByClassName('powerups')[0] as HTMLElement;
    this.aimPitchElement = container_sub.getElementsByClassName('crosshair__pitch')[0] as HTMLElement;
    this.crosshairElement = container_sub.getElementsByClassName('crosshair')[0] as HTMLElement;
  }

  _updateSpeed(keyboard: { [key: string]: number }, delta: number) {
    this.proceed = ((keyboard[this.proceedUpKey] || 0) - (keyboard[this.proceedDownKey] || 0)) * delta;
    this.rotate = ((keyboard[this.rotateLeftKey] || 0) - (keyboard[this.rotateRightKey] || 0)) * delta;
  }

  _updateAim(keyboard: { [key: string]: number }, delta: number) {
    if (!this.hasRotatingTurret) {
      this.setAimYaw(0);
      return;
    }
    this.aimInput = (keyboard[this.aimUpKey] || 0) - (keyboard[this.aimDownKey] || 0);
    this.setAimYaw(this.aimYaw + this.aimInput * this.aimYawSpeed * delta);
  }

  setAimYaw(yaw: number): void {
    this.aimYaw = this.hasRotatingTurret
        ? THREE.MathUtils.euclideanModulo(yaw + Math.PI, Math.PI * 2) - Math.PI
        : 0;
    this.aimAnchor.rotation.z = this.aimYaw;
    this.tankModel?.setTurretYaw(this.aimYaw);
  }

  _updateAimPitch(keyboard: { [key: string]: number }, delta: number) {
    this.aimInput = (keyboard[this.aimUpKey] || 0) - (keyboard[this.aimDownKey] || 0);
    this.aimPitch = THREE.MathUtils.clamp(
        this.aimPitch + this.aimInput * this.aimPitchSpeed * delta,
        this.aimPitchMin,
        this.aimPitchMax,
    );
  }

  _updatePosition(walls: Wall[], tanks: Tank[], surrounding_walls: Wall[]) {
    const tank_object_tmp = new Tank('temp', null, null, null, null);
    tank_object_tmp.mesh.applyMatrix4(this.mesh.matrix);
    tank_object_tmp.mesh.translateY(this.proceed * this.proceedSpeed);
    tank_object_tmp.mesh.rotateZ(this.rotate * this.rotateSpeed);
    tank_object_tmp.mesh.updateMatrix();

    const not_collided_with_surrounding_walls =
        (!surrounding_walls.some((wall) => checkCollisionTankWithWall(tank_object_tmp, wall)));

    if (this.penetrationUpgraded && not_collided_with_surrounding_walls) {
      this.mesh.translateY(this.proceed * this.proceedSpeed);
      this.mesh.rotateZ(this.rotate * this.rotateSpeed);
      return;
    }

    const not_collided = (!tanks.some((tank) => (tank.name !== this.name
            && checkCollisionTankWithTank(tank_object_tmp, tank)))
        && !walls.some((wall) => checkCollisionTankWithWall(tank_object_tmp, wall)));

    if (this.penetrationPermitted && not_collided_with_surrounding_walls || not_collided) {
      this.mesh.translateY(this.proceed * this.proceedSpeed);
      this.mesh.rotateZ(this.rotate * this.rotateSpeed);

      this.penetrationPermitted = !not_collided;
    }
  }

  _getBulletInitState() {
    // compute the initial position and direction of the bullet
    let localPos = this.bulletLocalPos.clone();
    let localDir = new THREE.Vector3(
        this.bulletLocalDir.x,
        Math.cos(this.aimPitch),
        Math.sin(this.aimPitch),
    ).normalize();
    this.aimAnchor.updateMatrixWorld(true);
    localPos.applyMatrix4(this.aimAnchor.matrixWorld);
    localDir.transformDirection(this.aimAnchor.matrixWorld);
    return {
      pos: localPos,
      vel: localDir.multiplyScalar(this.bulletSpeed),
    };
  }

  getBulletVelocity(yawOffset = 0): THREE.Vector3 {
    const localDir = new THREE.Vector3(
        Math.sin(yawOffset),
        Math.cos(yawOffset) * Math.cos(this.aimPitch),
        Math.sin(this.aimPitch),
    ).normalize();
    this.aimAnchor.updateMatrixWorld(true);
    return localDir.transformDirection(this.aimAnchor.matrixWorld).multiplyScalar(this.bulletSpeed);
  }

  getAimWorldPoint(distance = 420): THREE.Vector3 {
    const {pos, vel} = this._getBulletInitState();
    return pos.add(vel.normalize().multiplyScalar(distance));
  }

  getAimRay(): {origin: THREE.Vector3; direction: THREE.Vector3} {
    const {pos, vel} = this._getBulletInitState();
    return {
      origin: pos,
      direction: vel.normalize(),
    };
  }

  _createBullets(keyboard: { [key: string]: number }, bullets: Bullet[], scene: Scene) {
    // check keyboard, if space is pressed, create a bullet and add it to the scene
    if (keyboard[this.firingKey]) {
      const now = Date.now();
      if (!this.firingKeyPressed && now - this.lastFireTime > this.fireCooldownMs) {
        const {pos, vel} = this._getBulletInitState();
        this.proceed = (keyboard[this.proceedUpKey] || 0) - (keyboard[this.proceedDownKey] || 0);
        const tankVel = new THREE.Vector3(0, 1, 0).applyEuler(this.mesh.rotation).multiplyScalar(this.proceed * this.proceedSpeed);
        if (!this.bulletUpgraded) {
          const bullet = new Bullet('main', pos, vel.add(tankVel), this.attack, this.bullet_mesh, this.getBulletRotation(), this.listeners, this.audio);
          bullets.push(bullet);
          scene.add(bullet);
        } else {
          // TODO: make it more standard
          let vel2 = this.getBulletVelocity(-Math.PI / 6);
          let vel3 = this.getBulletVelocity(Math.PI / 6);
          const bullet1 = new Bullet('main', pos, vel.add(tankVel), this.attack, this.bullet_mesh,
              this.getBulletRotation(), this.listeners, this.audio);
          const bullet2 = new Bullet('main', pos, vel2.add(tankVel), this.attack, this.bullet_mesh,
              this.getBulletRotation(Math.PI / 6),
              this.listeners, this.audio);
          const bullet3 = new Bullet('main', pos, vel3.add(tankVel), this.attack, this.bullet_mesh,
              this.getBulletRotation(-Math.PI / 6),
              this.listeners, this.audio);
          bullets.push(bullet1, bullet2, bullet3);
          scene.add(bullet1);
          scene.add(bullet2);
          scene.add(bullet3);
        }

        this.firingKeyPressed = true;
        this.lastFireTime = now;
      }
    } else {
      this.firingKeyPressed = false;
    }
  }

  getBulletRotation(yawOffset = 0): THREE.Euler {
    return new THREE.Euler(this.aimPitch, this.mesh.rotation.y, this.mesh.rotation.z + this.aimYaw + yawOffset);
  }

  update(
      keyboard: { [key: string]: number },
      scene: Scene,
      tanks: Tank[],
      walls: Wall[],
      surrounding_walls: Wall[],
      bullets: Bullet[],
      delta: number,
  ) {
    this._updateSpeed(keyboard, delta);
    this._updateAim(keyboard, delta);
    this._updatePosition(walls, tanks, surrounding_walls);
    this._createBullets(keyboard, bullets, scene);
    this.tankModel?.update({
      aimPitch: this.aimPitch,
      aimYaw: this.aimYaw,
      movement: this.proceed * this.proceedSpeed,
    });
  }

  GetAttacked(attack: number) {
    this.health -= attack * (1 - this.defense);

    this.tankModel?.setDamageTint(0xff0000);
    setTimeout(() => this.tankModel?.clearDamageTint(), 1000);

    if (this.health <= 0) {
      this.reset();
    }
  }

  static onTick(_tank: Tank, _delta: number) {
  };

  tick(delta: number): void {
    if (!this.mesh) {
      return;
    }
    this._updateHealthAndPowerups(delta);
    Tank.onTick(this, delta);
  }

  reset() {
    this.mesh.position.copy(this.originalPos);
    this.mesh.rotation.copy(this.originalRot);
    this.setAimYaw(0);
    this.bulletUpgraded = false;
    this.penetrationUpgraded = true;
    this.penetrationPermitted = true;
    setTimeout(() => {
      this.penetrationUpgraded = false;
      // this.penetrationPermitted = false;
    }, 500);
    this.tankModel?.clearDamageTint();
    Object.values(this.powerups).forEach(pbar => pbar.remove());
    for (const key in this.powerups) {
      delete this.powerups[key];
      this.powerupPostHooks[key](this);
      delete this.powerupPostHooks[key];
    }
    this.powerups = {};
    this.powerupPostHooks = {};
    this.applyDefinitionStats(this.tankDefinition, false);
  }

  addPowerup(type: string, timeout: number, priorHook: (tank: Tank) => void, postHook: (tank: Tank) => void) {
    if (timeout <= 0) return;
    if (this.powerups[type] === undefined) {
      this.powerups[type] = new PBar(this.powerupsContainerElement, 'powerup', type, timeout);
      priorHook(this);
      this.powerupPostHooks[type] = postHook;
    } else {
      this.powerups[type].update(timeout);
    }
  }

  _updateHealthAndPowerups(delta: number) {
    if (!this.healthBarFillElement || !this.healthBarValueElement) {
      return;
    }
    const clampedHealth = Math.max(0, Math.min(this.maxHealth, this.health));
    const healthRatio = this.maxHealth > 0 ? clampedHealth / this.maxHealth : 0;
    this.healthBarFillElement.style.width = `${healthRatio * 100}%`;
    this.healthBarValueElement.innerText = `${clampedHealth.toFixed(0)}`;
    this.healthElement.dataset.state = healthRatio <= 0.25 ? 'critical' : healthRatio <= 0.55 ? 'warn' : 'ok';
    if (this.aimPitchElement && this.crosshairElement) {
      const aimDegrees = THREE.MathUtils.radToDeg(this.aimPitch);
      this.aimPitchElement.innerText = `${aimDegrees.toFixed(0)}°`;
    }

    for (const key in this.powerups) {
      let timeout = this.powerups[key].timeout - delta * 1000;
      this.powerups[key].update(timeout);
      if (timeout < 0) {
        delete this.powerups[key];
        this.powerupPostHooks[key](this);
        delete this.powerupPostHooks[key];
      }
    }
  }
}
