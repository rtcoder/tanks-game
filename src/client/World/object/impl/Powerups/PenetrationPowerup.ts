import * as THREE from 'three';
import {Tank} from '../Tank';
import {penetrateTime} from './powerups-time.ts';
import {TimeoutPowerup} from './TimeoutPowerup';

export class PenetrationPowerup extends TimeoutPowerup {
  constructor(name: string, mesh: THREE.Object3D, pos: THREE.Vector3,
              listeners: THREE.AudioListener[], audio: AudioBuffer) {
    super(name, 'penetration', mesh, pos, listeners, audio, penetrateTime);
  }

  PriorHook(tank: Tank): void {
    tank.penetrationUpgraded = true;
    tank.penetrationPermitted = true;
  }

  PostHook(tank: Tank): void {
    tank.penetrationUpgraded = false;
  }
}
