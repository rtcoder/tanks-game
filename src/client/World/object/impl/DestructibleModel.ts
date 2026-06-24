import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import type {
  GroundfireDestructibleModel as GroundfireDestructibleModelData,
  GroundfireDestructibleModelChunk,
} from '../../../../shared/types';
import {ChunkSpatialIndex} from '../../performance/ChunkSpatialIndex';

type RuntimeChunk = {
  id: string;
  name: string;
  mesh: THREE.Mesh;
  health: number;
  maxHealth: number;
  active: boolean;
  box: THREE.Box3;
};

export type DestructibleModelHit = {
  model: DestructibleModel;
  chunkId: string;
  chunkName: string;
  position: THREE.Vector3;
};

export class DestructibleModel {
  readonly data: GroundfireDestructibleModelData;
  readonly root: THREE.Group;
  readonly chunkIndex: ChunkSpatialIndex;
  readonly chunks = new Map<string, RuntimeChunk>();
  private readonly chunkOrder: RuntimeChunk[] = [];

  private constructor(data: GroundfireDestructibleModelData, root: THREE.Group) {
    this.data = data;
    this.root = root;
    this.chunkIndex = new ChunkSpatialIndex(Math.max(80, data.destructible.health * 0.5));
  }

  static async load(data: GroundfireDestructibleModelData, assetUrl: string): Promise<DestructibleModel> {
    const gltf = await new Promise<THREE.Group>((resolve, reject) => {
      new GLTFLoader().load(assetUrl, (loaded) => resolve(loaded.scene), undefined, reject);
    });
    const model = new DestructibleModel(data, gltf);
    model.configureRoot();
    model.collectChunks();
    return model;
  }

  findHitForObject(object: THREE.Object3D): DestructibleModelHit | null {
    const projectileBox = new THREE.Box3().setFromObject(object);
    if (projectileBox.isEmpty()) {
      return null;
    }

    const candidateIds = this.data.collision.spatialIndex === 'grid'
      ? this.chunkIndex.queryBox(projectileBox)
      : Array.from(this.chunks.keys());
    let best: RuntimeChunk | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    const projectileCenter = projectileBox.getCenter(new THREE.Vector3());

    for (const id of candidateIds) {
      const chunk = this.chunks.get(id);
      if (!chunk?.active || !projectileBox.intersectsBox(chunk.box)) {
        continue;
      }

      const distance = this.distanceToChunk(projectileCenter, chunk);
      if (distance < bestDistance) {
        best = chunk;
        bestDistance = distance;
      }
    }

    if (!best) {
      return null;
    }

    const chunk = best;

    return {
      model: this,
      chunkId: chunk.id,
      chunkName: chunk.name,
      position: projectileCenter.clone().clamp(chunk.box.min, chunk.box.max),
    };
  }

  intersectsBox(box: THREE.Box3): boolean {
    if (box.isEmpty()) {
      return false;
    }

    const candidateIds = this.data.collision.spatialIndex === 'grid'
      ? this.chunkIndex.queryBox(box)
      : Array.from(this.chunks.keys());
    return candidateIds.some((id) => {
      const chunk = this.chunks.get(id);
      return Boolean(chunk?.active && chunk.box.intersectsBox(box));
    });
  }

  applyDirectDamage(chunkId: string, amount: number): string[] {
    const chunk = this.chunks.get(chunkId);
    if (!chunk) {
      return [];
    }
    return this.damageChunk(chunk, amount) ? [chunk.id] : [];
  }

  removeChunk(chunkId: string): boolean {
    const chunk = this.chunks.get(chunkId);
    if (!chunk?.active) {
      return false;
    }

    this.destroyChunk(chunk);
    return true;
  }

  applyAreaDamage(center: THREE.Vector3, baseDamage: number, radius: number, minRatio: number, primaryChunkId?: string): string[] {
    const destroyedIds: string[] = [];
    const queryBox = new THREE.Box3(
        new THREE.Vector3(center.x - radius, center.y - radius, center.z - radius),
        new THREE.Vector3(center.x + radius, center.y + radius, center.z + radius),
    );
    const candidateIds = radius > 0 && this.data.collision.spatialIndex === 'grid'
      ? this.chunkIndex.queryBox(queryBox)
      : Array.from(this.chunks.keys());

    candidateIds.forEach((id) => {
      const chunk = this.chunks.get(id);
      if (!chunk?.active) {
        return;
      }

      const distance = id === primaryChunkId ? 0 : this.distanceToChunk(center, chunk);
      const damage = this.areaDamageAtDistance(baseDamage, distance, radius, minRatio);
      if (damage <= 0) {
        return;
      }

      if (this.damageChunk(chunk, damage)) {
        destroyedIds.push(chunk.id);
      }
    });

    return destroyedIds;
  }

  destruct(): void {
    this.root.parent?.remove(this.root);
    this.root.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        this.disposeMaterial(object.material);
      }
    });
    this.chunks.clear();
    this.chunkOrder.length = 0;
    this.chunkIndex.clear();
  }

  private configureRoot(): void {
    this.root.name = `destructible-model:${this.data.id}`;
    const axisMap = new THREE.Matrix4().set(
        this.data.scale[0], 0, 0, 0,
        0, 0, this.data.scale[2], 0,
        0, this.data.scale[1], 0, 0,
        0, 0, 0, 1,
    );
    const yaw = new THREE.Matrix4().makeRotationZ(this.data.rotation[2]);
    const translation = new THREE.Matrix4().makeTranslation(
        this.data.position[0],
        this.data.position[1],
        this.data.position[2],
    );
    this.root.matrixAutoUpdate = false;
    this.root.matrix.copy(translation.multiply(yaw).multiply(axisMap));
    this.root.updateMatrixWorld(true);
  }

  private collectChunks(): void {
    const meshes: THREE.Mesh[] = [];
    this.root.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        meshes.push(object);
      }
    });

    const chunkByNodeName = new Map(this.data.chunks.map((chunk) => [chunk.nodeName, chunk]));
    const usedChunkIds = new Set<string>();
    meshes.forEach((mesh, index) => {
      const chunkConfig = this.chunkConfigForMesh(mesh, index, chunkByNodeName, usedChunkIds);
      if (!chunkConfig) {
        mesh.visible = false;
        return;
      }

      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.material = this.cloneMaterial(mesh.material);
      const box = new THREE.Box3().setFromObject(mesh);
      const chunk: RuntimeChunk = {
        id: chunkConfig.id,
        name: chunkConfig.name,
        mesh,
        health: chunkConfig.health,
        maxHealth: chunkConfig.health,
        active: true,
        box,
      };
      mesh.userData.groundfireChunkId = chunk.id;
      this.chunks.set(chunk.id, chunk);
      this.chunkOrder.push(chunk);
      this.chunkIndex.insert(chunk.id, box);
    });
  }

  private chunkConfigForMesh(
      mesh: THREE.Mesh,
      index: number,
      chunkByNodeName: Map<string, GroundfireDestructibleModelChunk>,
      usedChunkIds: Set<string>,
  ): GroundfireDestructibleModelChunk | null {
    const named = chunkByNodeName.get(mesh.name);
    if (named && !usedChunkIds.has(named.id)) {
      usedChunkIds.add(named.id);
      return named;
    }

    const ordered = this.data.chunks[index];
    if (ordered && !usedChunkIds.has(ordered.id)) {
      usedChunkIds.add(ordered.id);
      return ordered;
    }

    if (this.data.chunks.length > 0) {
      return null;
    }

    return {
      id: `${this.data.id}:chunk-${index.toString().padStart(4, '0')}`,
      name: mesh.name || `Chunk ${index + 1}`,
      nodeName: mesh.name,
      health: this.data.destructible.health,
      collider: 'box',
    };
  }

  private damageChunk(chunk: RuntimeChunk, amount: number): boolean {
    if (!this.data.destructible.enabled || !chunk.active) {
      return false;
    }

    chunk.health = Math.max(0, chunk.health - amount);
    if (chunk.health <= 0) {
      this.destroyChunk(chunk);
      return true;
    }

    this.updateDamageTint(chunk);
    return false;
  }

  private destroyChunk(chunk: RuntimeChunk): void {
    chunk.active = false;
    chunk.mesh.visible = false;
    this.chunkIndex.remove(chunk.id);
  }

  private updateDamageTint(chunk: RuntimeChunk): void {
    const damageRatio = 1 - chunk.health / chunk.maxHealth;
    const materials = Array.isArray(chunk.mesh.material) ? chunk.mesh.material : [chunk.mesh.material];
    materials.forEach((material) => {
      if (material instanceof THREE.MeshStandardMaterial) {
        material.color.lerpColors(new THREE.Color(0xffffff), new THREE.Color(0x8b5f4f), damageRatio * 0.28);
        material.emissive.set(0x2a0d06);
        material.emissiveIntensity = damageRatio * 0.18;
        material.needsUpdate = true;
      }
    });
  }

  private distanceToChunk(point: THREE.Vector3, chunk: RuntimeChunk): number {
    return point.clone().clamp(chunk.box.min, chunk.box.max).distanceTo(point);
  }

  private areaDamageAtDistance(baseDamage: number, distance: number, radius: number, minRatio: number): number {
    if (distance <= 0) {
      return baseDamage;
    }
    if (radius <= 0 || distance > radius) {
      return 0;
    }

    return baseDamage * THREE.MathUtils.lerp(1, minRatio, distance / radius);
  }

  private cloneMaterial(material: THREE.Material | THREE.Material[]): THREE.Material | THREE.Material[] {
    return Array.isArray(material)
      ? material.map((item) => item.clone())
      : material.clone();
  }

  private disposeMaterial(material: THREE.Material | THREE.Material[]): void {
    if (Array.isArray(material)) {
      material.forEach((item) => item.dispose());
      return;
    }

    material.dispose();
  }
}
