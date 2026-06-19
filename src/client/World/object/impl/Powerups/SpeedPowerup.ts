import * as THREE from 'three';
import {Tank} from '../Tank';
import {TimeoutPowerup} from './TimeoutPowerup';

export class SpeedPowerup extends TimeoutPowerup {
  // proceedBoost: number = 2;
  // rotateBoost: number = 1.5;

  constructor(name: string, mesh: THREE.Object3D, pos: THREE.Vector3,
              listeners: THREE.AudioListener[], audio: AudioBuffer) {
    super(name, 'speed', mesh, pos, listeners, audio, 10000);
  }

  PriorHook(tank: Tank): void {
    tank.proceedSpeed = tank.proceedSpeed * 2;
    tank.rotateSpeed = tank.rotateSpeed * 1.5;
  }

  PostHook(tank: Tank): void {
    tank.proceedSpeed = tank.proceedSpeed / 2;
    tank.rotateSpeed = tank.rotateSpeed / 1.5;
  }
}
