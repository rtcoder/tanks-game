import * as THREE from 'three';

import {checkCollisionBulletWithTank, checkCollisionBulletWithWall} from '../../utils/collision';
import {MovableObject} from '../MovableObject';
import {Ground} from './Ground';
import {Tank} from './Tank';
import {Wall} from './Wall';

export class Bullet extends MovableObject {
  mesh: THREE.Group;
  listeners: THREE.AudioListener[];
  audio: { [key: string]: AudioBuffer };

  vel: THREE.Vector3;
  accel: THREE.Vector3;
  attack: number;
  onWallHit?: (wall: Wall, bullet: Bullet) => void;

  constructor(name: string, pos: THREE.Vector3, vel: THREE.Vector3, attack: number,
              mesh: THREE.Object3D, rotation: THREE.Euler, listeners: THREE.AudioListener[], audio: {
        [key: string]: AudioBuffer
      }, onWallHit?: (wall: Wall, bullet: Bullet) => void) {
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
    this.onWallHit = onWallHit;
  }

  update(ground: Ground, bullets: Bullet[], walls: Wall[], tanks: Tank[], _delta: number) {
    // Keep this flat projectile API ready for later ground-to-ground rockets.
    const hitWall = walls.find(wall => checkCollisionBulletWithWall(this, wall));
    if (this.mesh.position.z < 0 || hitWall || !ground.inBoundary(this.mesh.position)) {
      this.listeners.forEach(listener => {
        const sound = new THREE.PositionalAudio(listener);
        sound.setBuffer(this.audio['Bullet_hit']).setVolume(20).play();
      });

      if (hitWall) {
        this.onWallHit?.(hitWall, this);
      }
      this.destruct();
      bullets.splice(bullets.indexOf(this), 1);
      return;
    }

    // if hit a tank, delete from the scene
    // create an explosion, apply damage
    for (let tank of tanks) {
      if (checkCollisionBulletWithTank(this, tank)) {
        this.listeners.forEach(listener => {
          const sound = new THREE.PositionalAudio(listener);
          sound.setBuffer(this.audio['Bullet_hit']).setVolume(20).play();
        });

        this.destruct();
        bullets.splice(bullets.indexOf(this), 1);
        tank.GetAttacked(this.attack);
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
