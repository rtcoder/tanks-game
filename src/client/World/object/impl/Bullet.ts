import * as THREE from 'three';

import type {TankWeaponDefinition} from '../../tank-definitions/shared/tank-definition.type';
import type {DestructibleModelHit} from './DestructibleModel';
import {checkCollisionBulletWithTank, checkCollisionBulletWithWall} from '../../utils/collision';
import {MovableObject} from '../MovableObject';
import {Ground} from './Ground';
import {Tank} from './Tank';
import {Wall} from './Wall';

export type BulletWaterHit = {
  position: THREE.Vector3;
};

export type BulletImpactReason = 'wall' | 'tank' | 'terrain' | 'water' | 'boundary' | 'destructible-model';

export type BulletImpact = {
  position: THREE.Vector3;
  reason: BulletImpactReason;
  wall?: Wall;
  tank?: Tank;
  destructibleModelHit?: DestructibleModelHit;
};

export class Bullet extends MovableObject {
  mesh: THREE.Group;
  listeners: THREE.AudioListener[];
  audio: { [key: string]: AudioBuffer };

  vel: THREE.Vector3;
  accel: THREE.Vector3;
  attack: number;
  weapon: TankWeaponDefinition | null;
  onWallHit?: (wall: Wall, bullet: Bullet) => void;
  onImpact?: (impact: BulletImpact, bullet: Bullet) => void;

  constructor(name: string, pos: THREE.Vector3, vel: THREE.Vector3, attack: number,
              mesh: THREE.Object3D, rotation: THREE.Euler, listeners: THREE.AudioListener[], audio: {
        [key: string]: AudioBuffer
      }, onWallHit?: (wall: Wall, bullet: Bullet) => void, weapon: TankWeaponDefinition | null = null) {
    super('bullet', name);

    this.mesh = new THREE.Group();
    this.mesh.add(mesh.clone());
    this.mesh.children[0].scale.set(3, 3, 3);
    this.mesh.children[0].rotation.x = rotation.x;
    this.mesh.children[0].rotation.y = rotation.y;
    this.mesh.children[0].rotation.z = rotation.z + Math.PI / 2;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
    this.mesh.position.copy(pos);

    this.listeners = listeners;
    this.audio = audio;

    this.vel = vel;
    this.accel = new THREE.Vector3(0, 0, 0);

    this.attack = attack;
    this.weapon = weapon;
    this.onWallHit = onWallHit;
  }

  playHitSound(): void {
    this.listeners.forEach(listener => {
      const sound = new THREE.PositionalAudio(listener);
      sound.setBuffer(this.audio['Bullet_hit']).setVolume(20).play();
    });
  }

  finishImpact(bullets: Bullet[], impact: BulletImpact): void {
    this.playHitSound();
    if (impact.wall && !this.onImpact) {
      this.onWallHit?.(impact.wall, this);
    }
    this.onImpact?.(impact, this);
    this.destruct();
    bullets.splice(bullets.indexOf(this), 1);
  }

  update(
      ground: Ground,
      bullets: Bullet[],
      walls: Wall[],
      tanks: Tank[],
      _delta: number,
      waterHitAt?: (position: THREE.Vector3) => BulletWaterHit | null,
      onWaterHit?: (bullet: Bullet, hit: BulletWaterHit) => void,
      destructibleModelHitAt?: (object: THREE.Object3D) => DestructibleModelHit | null,
  ) {
    // Keep this flat projectile API ready for later ground-to-ground rockets.
    const hitWall = walls.find(wall => checkCollisionBulletWithWall(this, wall));
    const destructibleModelHit = destructibleModelHitAt?.(this.mesh) ?? null;
    const waterHit = waterHitAt?.(this.mesh.position) ?? null;
    if (
      waterHit
      || this.mesh.position.z < ground.heightAt(this.mesh.position.x, this.mesh.position.y)
      || hitWall
      || destructibleModelHit
      || !ground.inBoundary(this.mesh.position)
    ) {
      if (waterHit) {
        onWaterHit?.(this, waterHit);
      }
      this.finishImpact(bullets, {
        position: (waterHit?.position ?? destructibleModelHit?.position ?? this.mesh.position).clone(),
        reason: waterHit
          ? 'water'
          : hitWall
            ? 'wall'
            : destructibleModelHit
              ? 'destructible-model'
              : ground.inBoundary(this.mesh.position)
                ? 'terrain'
                : 'boundary',
        wall: hitWall,
        destructibleModelHit: destructibleModelHit ?? undefined,
      });
      return;
    }

    // if hit a tank, delete from the scene
    // create an explosion, apply damage
    for (let tank of tanks) {
      if (checkCollisionBulletWithTank(this, tank)) {
        this.finishImpact(bullets, {
          position: this.mesh.position.clone(),
          reason: 'tank',
          tank,
        });
        return;
      }
    }
  }

  static onTick(_bullet: Bullet, _delta: number) {
  };

  tick(delta: number): void {
    if (!this.mesh) {
      return;
    }
    this.mesh.position.add(this.vel.clone().multiplyScalar(delta));
    this.vel.add(this.accel.clone().multiplyScalar(delta));
    // TODO: add rotation
    // this.rotation.
    Bullet.onTick(this, delta);
  }
}
