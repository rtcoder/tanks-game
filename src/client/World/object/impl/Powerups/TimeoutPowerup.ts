import * as THREE from 'three';
import {Tank} from '../Tank';
import {Powerup} from './Powerup';

export abstract class TimeoutPowerup extends Powerup {
  timeout: number;

  protected constructor(name: string, type: string, mesh: THREE.Object3D, pos: THREE.Vector3,
                        listeners: THREE.AudioListener[], audio: AudioBuffer, timeout: number) {
    super(name, type, mesh, pos, listeners, audio);
    this.timeout = timeout;
  }

  abstract PriorHook(tank: Tank): void;

  abstract PostHook(tank: Tank): void;

  apply(tank_object: Tank): void {
    tank_object.addPowerup(this.powerup_type, this.timeout, this.PriorHook, this.PostHook);
  }

}
