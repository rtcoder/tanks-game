import * as THREE from 'three';
import {BaseObject} from '../../BaseObject';

export class DirectionalLight extends BaseObject {
  mesh: THREE.DirectionalLight;

  constructor(name: string) {
    super('directional-light', name);
    const light = new THREE.DirectionalLight(0xfff1c4, 2.6);
    light.position.set(-260, -180, 420);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.top = 900;
    light.shadow.camera.bottom = -900;
    light.shadow.camera.left = -900;
    light.shadow.camera.right = 900;
    light.shadow.camera.near = 50;
    light.shadow.camera.far = 1200;
    light.shadow.bias = -0.00025;
    this.mesh = light;
  }
}
