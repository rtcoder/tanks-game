import * as THREE from 'three';
import {Tank} from '../Tank';
import {Powerup} from './Powerup';

export class HealthPowerup extends Powerup {
  constructor(name: string, mesh: THREE.Object3D, pos: THREE.Vector3, listeners: THREE.AudioListener[], audio: AudioBuffer) {
    super(name, 'health', mesh, pos, listeners, audio);
  }

  apply(tank_object: Tank): void {
    tank_object.health += 10;
    if (tank_object.health > tank_object.maxHealth) {
      tank_object.health = tank_object.maxHealth;
    }
  }
}
