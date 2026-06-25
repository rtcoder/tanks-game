import * as THREE from 'three';
import {BaseObject} from '../../BaseObject.ts';

export class SkyDome extends BaseObject {
  mesh: THREE.Mesh;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D | null;
  private readonly texture: THREE.CanvasTexture;
  private readonly material: THREE.MeshBasicMaterial;
  private lastColorKey = '';

  constructor(name: string) {
    super('sky-dome', name);
    this.canvas = document.createElement('canvas');
    this.canvas.width = 4;
    this.canvas.height = 256;
    this.context = this.canvas.getContext('2d');
    this.paintGradient(0x6f9ed8, 0xd7c08a, 0x202616);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.material = new THREE.MeshBasicMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      map: this.texture,
    });
    this.mesh = new THREE.Mesh(
        new THREE.SphereGeometry(4200, 48, 24),
        this.material,
    );
    this.mesh.frustumCulled = false;
  }

  setColors(top: THREE.ColorRepresentation, horizon: THREE.ColorRepresentation, ground: THREE.ColorRepresentation): void {
    if (!this.paintGradient(top, horizon, ground)) {
      return;
    }
    this.texture.needsUpdate = true;
  }

  private paintGradient(
      top: THREE.ColorRepresentation,
      horizon: THREE.ColorRepresentation,
      ground: THREE.ColorRepresentation,
  ): boolean {
    if (!this.context) {
      return false;
    }
    const topColor = new THREE.Color(top);
    const horizonColor = new THREE.Color(horizon);
    const groundColor = new THREE.Color(ground);
    const colorKey = `${topColor.getHexString()}:${horizonColor.getHexString()}:${groundColor.getHexString()}`;
    if (colorKey === this.lastColorKey) {
      return false;
    }
    this.lastColorKey = colorKey;
    const gradient = this.context.createLinearGradient(0, 0, 0, this.canvas.height);
    gradient.addColorStop(0, topColor.getStyle());
    gradient.addColorStop(0.58, horizonColor.getStyle());
    gradient.addColorStop(1, groundColor.getStyle());
    this.context.fillStyle = gradient;
    this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    return true;
  }
}
