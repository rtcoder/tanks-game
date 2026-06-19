import * as THREE from 'three';
import {checkCollisionPowerupWithTank, checkCollisionPowerupWithWall} from '../../../utils/collision';
import {MovableObject} from '../../MovableObject';
import {Tank} from '../Tank';
import {Wall} from '../Wall';

export abstract class Powerup extends MovableObject {
  powerup_type: string;
  mesh: THREE.Group;
  listeners: THREE.AudioListener[];
  audio: AudioBuffer;

  rotationSpeed: number = 2;
  zSpeed: number = 10;
  zDirection: number = 1;
  zBounds: number[] = [10, 20];
  changeZDirection: boolean = false;

  constructor(name: string, type: string, mesh: THREE.Object3D, pos: THREE.Vector3,
              listeners: THREE.AudioListener[], audio: AudioBuffer) {
    super(`powerup-${type}`, name);
    this.powerup_type = type;

    this.mesh = new THREE.Group();
    this.mesh.add(mesh.children[0].clone());
    this.mesh.children[0].scale.set(20, 20, 20);
    this.mesh.children[0].rotation.x = Math.PI / 2;
    this.mesh.position.copy(pos);

    this.mesh.rotateZ(Math.random() * Math.PI);

    this.listeners = listeners;
    this.audio = audio;
  }

  update(_powerups: Powerup[], tanks: Tank[], walls: Wall[]) {
    for (const tank of tanks) {
      if (checkCollisionPowerupWithTank(this, tank)) {
        this.listeners.forEach(listener => {
          const sound = new THREE.PositionalAudio(listener);
          sound.setBuffer(this.audio).setVolume(200).play();
        });
        let new_position;
        let is_collide = true;
        while (is_collide) {
          new_position = new THREE.Vector3(Math.random() * 1000 - 500, Math.random() * 1000 - 500, 15);
          this.mesh.position.copy(new_position);
          let no_collide = true;
          for (let wall of walls) {
            if (checkCollisionPowerupWithWall(this, wall)) {
              no_collide = false;
              break;
            }
          }
          is_collide = !no_collide;
        }
        // this.mesh.position.copy(new_position);
        this.apply(tank);
        // this.destruct();
        // powerups.splice(powerups.indexOf(this), 1);
        return;
      }
    }
  }

  static onTick(_powerup: Powerup, _delta: number) {
  }

  tick(delta: number): void {
    if (!this.mesh) {
      return;
    }
    // console.log("powerup tick")
    this._updatePosition(delta);
    Powerup.onTick(this, delta);
  }

  _updatePosition(delta: number) {
    const newPositionZ = this.mesh.position.z + this.zDirection * this.zSpeed * delta;

    // Check if the new position will exceed the bounds
    if (newPositionZ > this.zBounds[1]) {
      this.mesh.position.z = this.zBounds[1];
      this.zDirection = -1;
    } else if (newPositionZ < this.zBounds[0]) {
      this.mesh.position.z = this.zBounds[0];
      this.zDirection = 1;
    } else {
      this.mesh.position.z = newPositionZ;
    }

    if (
        this.mesh.position.z > this.zBounds[1] ||
        this.mesh.position.z < this.zBounds[0]
    ) {
      this.zDirection *= -1;
    }
    this.mesh.position.z += this.zDirection * this.zSpeed * delta;
    this.mesh.rotateZ(this.rotationSpeed * delta);
  }

  abstract apply(tank_object: Tank): void;
}
