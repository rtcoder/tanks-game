import * as THREE from 'three';
import {Tank} from '../Tank';
import {Powerup} from './Powerup';

export class GoalPowerup extends Powerup {
  constructor(name: string, mesh: THREE.Object3D, pos: THREE.Vector3, listeners: THREE.AudioListener[], audio: AudioBuffer) {
    super(name, 'goal', mesh, pos, listeners, audio);
  }

  apply(tank_object: Tank): void {
    document.dispatchEvent(new CustomEvent('gameover', {detail: {winner: tank_object.name}}));
  }
}
