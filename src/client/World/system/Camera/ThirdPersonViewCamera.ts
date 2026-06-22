import * as THREE from 'three';
import {Tank} from '../../object/impl/Tank';
import type {Ground} from '../../object/impl/Ground';
import {Camera} from './Camera.ts';

export type TankCameraMode = 'chase' | 'gunner';

export class ThirdPersonViewCamera extends Camera {
  cameraDistance: number = 185;
  cameraHeight: number = 78;
  lookAheadDistance: number = 110;
  gunnerLookDistance: number = 520;
  minChaseGroundClearance: number = 46;
  chaseRaiseSmoothing: number = 0.32;
  chaseLowerSmoothing: number = 0.08;
  mode: TankCameraMode = 'chase';
  tank: Tank;
  followTurretInChase: boolean = false;
  smoothedChaseHeight: number | null = null;

  constructor(tank: Tank, aspect: number) {
    super();
    this.tank = tank;
    this._camera = new THREE.PerspectiveCamera(
        75,
        aspect,
        0.05,
        1000,
    );
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

  toggleChaseTurretFollow(): boolean {
    this.followTurretInChase = !this.followTurretInChase;
    this.updateView(true);
    return this.followTurretInChase;
  }

  updateView(immediate = false, ground?: Ground): void {
    if (this.mode === 'gunner') {
      this.ensureCameraParent(this.tank.aimAnchor);
      this._camera.position.lerp(this.gunnerPosition(), immediate ? 1 : 0.18);
      this.lookAtLocal(this.gunnerLookAt());
      return;
    }

    this.ensureCameraParent(null);
    const tankPosition = this.tank.mesh.position;
    const chaseYaw = this.tank.mesh.rotation.z + (this.followTurretInChase ? this.tank.aimYaw : 0);
    const forward = new THREE.Vector3(-Math.sin(chaseYaw), Math.cos(chaseYaw), 0);
    const desiredPosition = tankPosition.clone()
        .addScaledVector(forward, -this.cameraDistance);
    const tankGroundHeight = tankPosition.z;
    let desiredHeight = tankGroundHeight + this.cameraHeight;
    if (ground) {
      desiredHeight = Math.max(
          desiredHeight,
          ground.heightAt(desiredPosition.x, desiredPosition.y) + this.minChaseGroundClearance,
      );
    }
    this.smoothedChaseHeight = immediate || this.smoothedChaseHeight === null
        ? desiredHeight
        : THREE.MathUtils.lerp(
            this.smoothedChaseHeight,
            desiredHeight,
            desiredHeight > this.smoothedChaseHeight ? this.chaseRaiseSmoothing : this.chaseLowerSmoothing,
        );
    desiredPosition.z = this.smoothedChaseHeight;

    this._camera.position.lerp(desiredPosition, immediate ? 1 : 0.18);
    const lookAt = tankPosition.clone()
        .addScaledVector(forward, this.lookAheadDistance);
    lookAt.z = tankGroundHeight + 32;
    this._camera.lookAt(lookAt);
  }

  private ensureCameraParent(parent: THREE.Object3D | null): void {
    const targetParent = parent ?? this.tank.mesh.parent ?? null;
    if (this._camera.parent === targetParent) {
      return;
    }

    const worldPosition = new THREE.Vector3();
    const worldQuaternion = new THREE.Quaternion();
    this._camera.getWorldPosition(worldPosition);
    this._camera.getWorldQuaternion(worldQuaternion);
    this._camera.parent?.remove(this._camera);
    targetParent?.add(this._camera);
    this._camera.position.copy(worldPosition);
    this._camera.quaternion.copy(worldQuaternion);
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
