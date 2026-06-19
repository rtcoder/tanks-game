import * as THREE from 'three';
import {BaseObject} from '../../BaseObject';

export class HemiSphereLight extends BaseObject {
  mesh: THREE.HemisphereLight;

  constructor(name: string) {
    super('hemi-sphere-light', name);
    this.mesh = new THREE.HemisphereLight(0xb9d9ff, 0x5d6244, 1.1);
  }
}
