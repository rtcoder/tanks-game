import * as THREE from 'three';

export abstract class Camera {
  _camera!: THREE.PerspectiveCamera;

  abstract get camera(): THREE.PerspectiveCamera;
}
