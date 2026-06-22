import * as THREE from 'three';
import {Tank} from '../../object/impl/Tank';
import {Camera} from './Camera.ts';

export type TankCameraMode = 'chase' | 'gunner';

export class ThirdPersonViewCamera extends Camera {
  cameraDistance: number = 185;
  cameraHeight: number = 72;
  lookAheadDistance: number = 95;
  gunnerLookDistance: number = 520;
  mode: TankCameraMode = 'chase';
  tank: Tank;

  constructor(tank: Tank, aspect: number) {
    super();
    this.tank = tank;
    this._camera = new THREE.PerspectiveCamera(
        75,
        aspect,
        0.05,
        1000,
    );
    // Follow the turret direction; the hull keeps its own movement heading.
    tank.aimAnchor.add(this._camera);
    this._camera.up.set(0, 0, 1);
    this.updateView(true);
  }

  setMode(mode: TankCameraMode): void {
    this.mode = mode;
    this.updateView(true);
  }

  toggleMode(): TankCameraMode {
    this.setMode(this.mode === 'chase' ? 'gunner' : 'chase');
    return this.mode;
  }

  updateView(immediate = false): void {
    const targetPosition = this.mode === 'gunner'
        ? this.gunnerPosition()
        : new THREE.Vector3(0, -this.cameraDistance, this.cameraHeight);
    this._camera.position.lerp(targetPosition, immediate ? 1 : 0.18);

    const lookAt = this.mode === 'gunner'
        ? this.gunnerLookAt()
        : new THREE.Vector3(0, this.lookAheadDistance, 24);
    this.lookAtLocal(lookAt);
  }

  private lookAtLocal(localTarget: THREE.Vector3): void {
    const parent = this._camera.parent;
    if (!parent) {
      this._camera.lookAt(localTarget);
      return;
    }

    parent.updateWorldMatrix(true, false);
    const worldTarget = localTarget.clone();
    parent.localToWorld(worldTarget);
    this._camera.lookAt(worldTarget);
  }

  private gunnerPosition(): THREE.Vector3 {
    return new THREE.Vector3(
        0,
        Math.max(24, this.tank.bulletLocalPos.y - 26),
        Math.max(28, this.tank.bulletLocalPos.z + 7),
    );
  }

  private gunnerLookAt(): THREE.Vector3 {
    const eye = this.gunnerPosition();
    return new THREE.Vector3(
        0,
        eye.y + this.gunnerLookDistance,
        eye.z + Math.tan(this.tank.aimPitch) * this.gunnerLookDistance,
    );
  }

  get camera() {
    return this._camera;
  }
}
