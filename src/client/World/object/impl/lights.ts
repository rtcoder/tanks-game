import * as THREE from "three";
import { BaseObject } from "../BaseObject";

class HemiSphereLight extends BaseObject {
  mesh: THREE.HemisphereLight;
  constructor(name: string) {
    super("hemi-sphere-light", name);
    const light = new THREE.HemisphereLight("blue", "gray", 0.02);
    this.mesh = light;
  }
}

class DirectionalLight extends BaseObject {
  mesh: THREE.DirectionalLight;
  constructor(name: string) {
    super("directional-light", name);
    const light = new THREE.DirectionalLight("white", 4);
    light.position.set(0, 20, 100);
    light.castShadow = true;
    light.shadow.camera.top = 500;
    light.shadow.camera.bottom = -500;
    light.shadow.camera.left = - 500;
    light.shadow.camera.right = 500;
    this.mesh = light;
  }
}

export { HemiSphereLight, DirectionalLight };
