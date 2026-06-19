import * as THREE from 'three';
import {Tank} from '../Tank';
import {TimeoutPowerup} from './TimeoutPowerup';

export class WeaponPowerup extends TimeoutPowerup {
  constructor(name: string, mesh: THREE.Object3D, pos: THREE.Vector3,
              listeners: THREE.AudioListener[], audio: AudioBuffer) {
    super(name, 'weapon', mesh, pos, listeners, audio, 10000);
  }

  PriorHook(tank: Tank): void {
    tank.bulletUpgraded = true;
  }

  PostHook(tank: Tank): void {
    tank.bulletUpgraded = false;
  }
}
