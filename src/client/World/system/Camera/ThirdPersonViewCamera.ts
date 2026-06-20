import * as THREE from 'three';
import {Tank} from '../../object/impl/Tank';
import {Camera} from './Camera.ts';

export class ThirdPersonViewCamera extends Camera {
  cameraDistance: number = 185;
  cameraHeight: number = 72;
  lookAheadDistance: number = 95;

  constructor(tank: Tank, aspect: number) {
    super();
    this._camera = new THREE.PerspectiveCamera(
        75,
        aspect,
        0.1,
        1000,
    );
    // Follow the turret direction; the hull keeps its own movement heading.
    tank.aimAnchor.add(this._camera);
    this._camera.up.set(0, 0, 1);
    this._camera.position.set(0, -this.cameraDistance, this.cameraHeight);
    this._camera.lookAt(new THREE.Vector3(0, this.lookAheadDistance, 24));
  }

  get camera() {
    return this._camera;
  }
}
