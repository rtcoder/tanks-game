import * as THREE from 'three';
import {Tank} from '../Tank';
import {TimeoutPowerup} from './TimeoutPowerup';

export class AttackPowerup extends TimeoutPowerup {
  constructor(name: string, mesh: THREE.Object3D, pos: THREE.Vector3,
              listeners: THREE.AudioListener[], audio: AudioBuffer) {
    super(name, 'attack', mesh, pos, listeners, audio, 10000);
  }

  PriorHook(tank: Tank): void {
    tank.attack *= 2;
  }

  PostHook(tank: Tank): void {
    tank.attack /= 2;
  }
}
