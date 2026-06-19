import * as THREE from 'three';
import {BaseObject} from '../object/BaseObject';

export class Scene {
  scene: THREE.Scene;

  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8fb5d6);
    this.scene.fog = new THREE.Fog(0xd7c08a, 1400, 3800);
  }

  add(object: BaseObject) {
    if (object.mesh) {
      this.scene.add(object.mesh);
    }
  }
}
