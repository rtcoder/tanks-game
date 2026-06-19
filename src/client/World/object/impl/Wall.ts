import * as THREE from 'three';
import {BaseObject} from '../BaseObject';
export class Wall extends BaseObject {
  mesh: THREE.Mesh;
  id: string;
  destructible: boolean;
  destroyed = false;
  maxHealth: number;
  health: number;
  size: THREE.Vector3;
  crackLines: THREE.LineSegments | null = null;

  constructor(name: string, texture: {
    [key: string]: THREE.Texture
  }, size: THREE.Vector3, position: THREE.Vector3, rotation: THREE.Euler, options: {
    id?: string;
    destructible?: boolean;
    health?: number;
  } = {}) {
    super('wall', name);
    this.id = options.id ?? `wall-${position.x}:${position.y}:${rotation.z}`;
    this.destructible = options.destructible ?? true;
    this.maxHealth = options.health ?? 20;
    this.health = this.maxHealth;
    this.size = size.clone();
    const material = new THREE.MeshStandardMaterial({
      color: 0x827b6c,
      roughness: 0.88,
      metalness: 0.02,
    });

    if (texture['albedo'] === undefined) {
      material.color.set(0x827b6c);
    } else {
      const albedoTexture = texture['albedo'];
      const aoTexture = texture['ao'];
      const heightTexture = texture['height'];
      const metallicTexture = texture['metallic'];
      const normalTexture = texture['normal'];
      const roughnessTexture = texture['roughness'];

      // Set the textures to your material's properties
      material.map = albedoTexture;
      material.aoMap = aoTexture;
      material.displacementMap = heightTexture;
      material.metalnessMap = metallicTexture;
      material.normalMap = normalTexture;
      material.roughnessMap = roughnessTexture;
    }

    this.mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size.x, size.y, size.z),
        // new THREE.MeshLambertMaterial({ color: "grey" })
        material,
    );
    this.mesh.position.copy(position);
    this.mesh.rotation.copy(rotation);
    this.mesh.receiveShadow = true;
  }

  damage(amount: number): boolean {
    if (!this.destructible || this.destroyed) {
      return false;
    }

    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) {
      this.destroyed = true;
      this.destruct();
      return true;
    }

    this.updateDamageVisual();
    return false;
  }

  updateDamageVisual(): void {
    const damageRatio = 1 - this.health / this.maxHealth;
    const materials = Array.isArray(this.mesh.material) ? this.mesh.material : [this.mesh.material];
    materials.forEach((material) => {
      if (material instanceof THREE.MeshStandardMaterial) {
        material.color.lerp(new THREE.Color(0x3f2d28), damageRatio * 0.45);
      }
    });
    this.updateCracks(damageRatio);
  }

  updateCracks(damageRatio: number): void {
    this.crackLines?.geometry.dispose();
    if (this.crackLines?.material instanceof THREE.Material) {
      this.crackLines.material.dispose();
    }
    this.crackLines?.removeFromParent();

    const crackCount = Math.max(1, Math.ceil(damageRatio * 5));
    const points: number[] = [];
    const halfX = this.size.x / 2 + 0.35;
    const halfY = this.size.y / 2;
    const topZ = this.size.z / 2 + 0.45;

    for (let index = 0; index < crackCount; index++) {
      const seed = this.hashSeed(index);
      const startY = -halfY + (seed % 1000) / 1000 * this.size.y;
      const startZ = topZ - 4 - ((seed >> 4) % 12);
      const zig = ((seed >> 8) % 9) - 4;
      points.push(
          -halfX, startY, startZ,
          -halfX, Math.max(-halfY, Math.min(halfY, startY + zig * 2.4)), Math.max(2, startZ - 8),
          halfX, startY * 0.72, topZ - 2,
          halfX, Math.max(-halfY, Math.min(halfY, startY - zig * 2.1)), Math.max(2, startZ - 7),
      );
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    this.crackLines = new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial({
          color: 0x160f0c,
          transparent: true,
          opacity: Math.min(0.95, 0.35 + damageRatio * 0.75),
        }),
    );
    this.mesh.add(this.crackLines);
  }

  hashSeed(salt: number): number {
    let hash = 2166136261;
    const source = `${this.id}:${salt}`;
    for (let index = 0; index < source.length; index++) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  destruct() {
    if (!this.mesh.parent) {
      return;
    }
    this.crackLines?.geometry.dispose();
    if (this.crackLines?.material instanceof THREE.Material) {
      this.crackLines.material.dispose();
    }
    this.mesh.geometry.dispose();
    this.mesh.parent?.remove(this.mesh);
  }
}
