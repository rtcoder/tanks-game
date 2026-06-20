import * as THREE from 'three';
import {Tank} from '../Tank';
import {defenseTime} from './powerups-time.ts';
import {TimeoutPowerup} from './TimeoutPowerup';

export class DefensePowerup extends TimeoutPowerup {
  constructor(name: string, mesh: THREE.Object3D, pos: THREE.Vector3,
              listeners: THREE.AudioListener[], audio: AudioBuffer) {
    super(name, 'defense', mesh, pos, listeners, audio, defenseTime);
  }

  PriorHook(tank: Tank): void {
    tank.defense = 0.5;
  }

  PostHook(tank: Tank): void {
    tank.defense = 0;
  }
}
