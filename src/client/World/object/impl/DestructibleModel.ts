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
  mesh: THREE.Mesh | null;
  batch: THREE.BatchedMesh | null;
  batchInstanceId: number | null;
  material: THREE.Material | THREE.Material[] | null;
  health: number;
  maxHealth: number;
  active: boolean;
  visible: boolean;
  box: THREE.Box3;
  center: THREE.Vector3;
  radius: number;
};

type BatchGroup = {
  parent: THREE.Object3D;
  material: THREE.Material;
  chunks: RuntimeChunk[];
  meshes: THREE.Mesh[];
  maxVertices: number;
  maxIndices: number;
};

type FallingDebris = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  centerGroundOffset: number;
  age: number;
  settledAge: number;
  settled: boolean;
  bounces: number;
};

const DESTRUCTIBLE_BATCH_MIN_MESHES = 24;
const DESTRUCTIBLE_VISIBLE_CHUNK_BUDGET = 2600;
const DESTRUCTIBLE_ALWAYS_VISIBLE_RADIUS = 420;
const DESTRUCTIBLE_MAX_VISIBLE_DISTANCE = 2600;
const DESTRUCTIBLE_VISIBILITY_INTERVAL = 0.12;
const DESTRUCTIBLE_DEBRIS_MAX_ACTIVE = 180;
const DESTRUCTIBLE_DEBRIS_GRAVITY = 520;
const DESTRUCTIBLE_DEBRIS_MAX_FALL_SPEED = 760;
const DESTRUCTIBLE_DEBRIS_SETTLE_LIFETIME = 9;
const DESTRUCTIBLE_DEBRIS_FADE_DURATION = 1.6;
const DESTRUCTIBLE_DEBRIS_MIN_DIMENSION = 1.5;
const DESTRUCTIBLE_DEBRIS_MIN_VISIBLE_THICKNESS = 3;

export type DestructibleModelHit = {
  model: DestructibleModel;
  chunkId: string;
  chunkName: string;
  position: THREE.Vector3;
};

export type DestructibleModelStats = {
  chunks: number;
  batchedMeshes: number;
  batchedChunks: number;
  visibleBudget: number;
};

export class DestructibleModel {
  readonly data: GroundfireDestructibleModelData;
  readonly root: THREE.Group;
  readonly chunkIndex: ChunkSpatialIndex;
  readonly chunks = new Map<string, RuntimeChunk>();
  readonly batchedMeshes: THREE.BatchedMesh[] = [];
  readonly fallingDebris: FallingDebris[] = [];
  private readonly chunkOrder: RuntimeChunk[] = [];
  private visibilityElapsed = DESTRUCTIBLE_VISIBILITY_INTERVAL;
  private readonly visibilityFrustum = new THREE.Frustum();
  private readonly visibilityMatrix = new THREE.Matrix4();

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
    model.batchStaticChunks();
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

      if (this.damageChunk(chunk, damage, center)) {
        destroyedIds.push(chunk.id);
      }
    });

    return destroyedIds;
  }

  destruct(): void {
    this.root.parent?.remove(this.root);
    const disposedMaterials = new Set<THREE.Material>();
    const disposedGeometries = new Set<THREE.BufferGeometry>();
    this.root.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        if (!disposedGeometries.has(object.geometry)) {
          object.geometry.dispose();
          disposedGeometries.add(object.geometry);
        }
        this.disposeMaterialOnce(object.material, disposedMaterials);
      }
    });
    this.chunks.clear();
    this.chunkOrder.length = 0;
    this.batchedMeshes.length = 0;
    this.fallingDebris.forEach((debris) => this.disposeDebris(debris));
    this.fallingDebris.length = 0;
    this.chunkIndex.clear();
  }

  update(delta: number, groundHeightAt: (x: number, y: number) => number): void {
    this.updateFallingDebris(delta, groundHeightAt);
  }

  updateVisibility(camera: THREE.Camera, focus: THREE.Vector3, delta: number): void {
    if (this.chunkOrder.length <= DESTRUCTIBLE_VISIBLE_CHUNK_BUDGET) {
      return;
    }

    this.visibilityElapsed += delta;
    if (this.visibilityElapsed < DESTRUCTIBLE_VISIBILITY_INTERVAL) {
      return;
    }
    this.visibilityElapsed = 0;

    camera.updateMatrixWorld(true);
    this.visibilityMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.visibilityFrustum.setFromProjectionMatrix(this.visibilityMatrix);
    const maxDistanceSq = DESTRUCTIBLE_MAX_VISIBLE_DISTANCE * DESTRUCTIBLE_MAX_VISIBLE_DISTANCE;
    const alwaysVisibleSq = DESTRUCTIBLE_ALWAYS_VISIBLE_RADIUS * DESTRUCTIBLE_ALWAYS_VISIBLE_RADIUS;
    const candidates: Array<{ chunk: RuntimeChunk; distanceSq: number }> = [];

    this.chunkOrder.forEach((chunk) => {
      if (!chunk.active) {
        this.setChunkRenderVisible(chunk, false);
        return;
      }

      const distanceSq = chunk.center.distanceToSquared(focus);
      if (distanceSq <= alwaysVisibleSq) {
        candidates.push({chunk, distanceSq});
        return;
      }
      if (distanceSq > maxDistanceSq) {
        this.setChunkRenderVisible(chunk, false);
        return;
      }

      const sphere = new THREE.Sphere(chunk.center, chunk.radius);
      if (this.visibilityFrustum.intersectsSphere(sphere)) {
        candidates.push({chunk, distanceSq});
      } else {
        this.setChunkRenderVisible(chunk, false);
      }
    });

    candidates.sort((left, right) => left.distanceSq - right.distanceSq);
    candidates.forEach(({chunk}, index) => {
      this.setChunkRenderVisible(chunk, index < DESTRUCTIBLE_VISIBLE_CHUNK_BUDGET);
    });
  }

  stats(): DestructibleModelStats {
    let batchedChunks = 0;
    this.chunkOrder.forEach((chunk) => {
      if (chunk.batch) {
        batchedChunks += 1;
      }
    });

    return {
      chunks: this.chunkOrder.length,
      batchedMeshes: this.batchedMeshes.length,
      batchedChunks,
      visibleBudget: DESTRUCTIBLE_VISIBLE_CHUNK_BUDGET,
    };
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

      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(mesh);
      const center = box.getCenter(new THREE.Vector3());
      const chunk: RuntimeChunk = {
        id: chunkConfig.id,
        name: chunkConfig.name,
        mesh,
        batch: null,
        batchInstanceId: null,
        material: mesh.material,
        health: chunkConfig.health,
        maxHealth: chunkConfig.health,
        active: true,
        visible: true,
        box,
        center,
        radius: center.distanceTo(box.max),
      };
      mesh.userData.groundfireChunkId = chunk.id;
      this.chunks.set(chunk.id, chunk);
      this.chunkOrder.push(chunk);
      this.chunkIndex.insert(chunk.id, box);
    });
  }

  private batchStaticChunks(): void {
    if (this.chunkOrder.length < DESTRUCTIBLE_BATCH_MIN_MESHES) {
      return;
    }

    const groups = this.batchGroups();
    groups.forEach((group) => {
      if (group.meshes.length < DESTRUCTIBLE_BATCH_MIN_MESHES) {
        return;
      }

      try {
        const material = group.material.clone();
        if (material instanceof THREE.MeshStandardMaterial) {
          material.color.set(0xffffff);
        }
        const batchedMesh = new THREE.BatchedMesh(
            group.meshes.length,
            group.maxVertices,
            group.maxIndices,
            material,
        );
        batchedMesh.name = `${this.data.id}:batch:${this.batchedMeshes.length}`;
        batchedMesh.castShadow = false;
        batchedMesh.receiveShadow = false;
        batchedMesh.frustumCulled = true;
        batchedMesh.perObjectFrustumCulled = true;
        batchedMesh.sortObjects = false;

        const geometryIds = new Map<THREE.BufferGeometry, number>();
        const inverseParentMatrix = new THREE.Matrix4().copy(group.parent.matrixWorld).invert();

        group.meshes.forEach((mesh, index) => {
          const chunk = group.chunks[index];
          let geometryId = geometryIds.get(mesh.geometry);
          if (geometryId === undefined) {
            geometryId = batchedMesh.addGeometry(mesh.geometry);
            geometryIds.set(mesh.geometry, geometryId);
          }

          const instanceId = batchedMesh.addInstance(geometryId);
          const localMatrix = new THREE.Matrix4().copy(mesh.matrixWorld).premultiply(inverseParentMatrix);
          batchedMesh.setMatrixAt(instanceId, localMatrix);
          if (mesh.material instanceof THREE.MeshStandardMaterial) {
            batchedMesh.setColorAt(instanceId, mesh.material.color);
          }
          chunk.batch = batchedMesh;
          chunk.batchInstanceId = instanceId;
          chunk.mesh = null;
        });

        group.parent.add(batchedMesh);
        this.batchedMeshes.push(batchedMesh);
        group.meshes.forEach((mesh) => {
          mesh.parent?.remove(mesh);
          mesh.geometry.dispose();
        });
        batchedMesh.computeBoundingBox();
        batchedMesh.computeBoundingSphere();
      } catch (error) {
        console.warn(`Could not batch destructible model group "${this.data.id}"`, error);
      }
    });
  }

  private batchGroups(): BatchGroup[] {
    const groups = new Map<string, BatchGroup>();
    this.chunkOrder.forEach((chunk) => {
      const mesh = chunk.mesh;
      if (!mesh || Array.isArray(mesh.material) || !mesh.parent || !mesh.geometry.attributes.position) {
        return;
      }
      const indexCount = mesh.geometry.index?.count ?? 0;
      const key = `${mesh.parent.uuid}:${mesh.material.uuid}:${this.geometryAttributeSignature(mesh.geometry)}`;
      const group = groups.get(key) ?? {
        parent: mesh.parent,
        material: mesh.material,
        chunks: [],
        meshes: [],
        maxVertices: 0,
        maxIndices: 0,
      };
      group.chunks.push(chunk);
      group.meshes.push(mesh);
      group.maxVertices += mesh.geometry.attributes.position.count;
      group.maxIndices += indexCount;
      groups.set(key, group);
    });

    return Array.from(groups.values());
  }

  private geometryAttributeSignature(geometry: THREE.BufferGeometry): string {
    return Object.keys(geometry.attributes)
        .sort()
        .map((name) => {
          const attribute = geometry.attributes[name];
          return `${name}:${attribute.itemSize}:${attribute.normalized ? 1 : 0}`;
        })
        .join('|') + `|indexed:${geometry.index ? 1 : 0}`;
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

  private damageChunk(chunk: RuntimeChunk, amount: number, impactCenter?: THREE.Vector3): boolean {
    if (!this.data.destructible.enabled || !chunk.active) {
      return false;
    }

    chunk.health = Math.max(0, chunk.health - amount);
    if (chunk.health <= 0) {
      this.destroyChunk(chunk, impactCenter);
      return true;
    }

    this.updateDamageTint(chunk);
    return false;
  }

  private destroyChunk(chunk: RuntimeChunk, impactCenter?: THREE.Vector3): void {
    chunk.active = false;
    this.spawnDebris(chunk, impactCenter);
    this.setChunkRenderVisible(chunk, false);
    this.chunkIndex.remove(chunk.id);
  }

  private updateDamageTint(chunk: RuntimeChunk): void {
    const damageRatio = 1 - chunk.health / chunk.maxHealth;
    if (chunk.batch && chunk.batchInstanceId !== null) {
      chunk.batch.setColorAt(
          chunk.batchInstanceId,
          new THREE.Color(0xffffff).lerp(new THREE.Color(0x8b5f4f), damageRatio * 0.28),
      );
      return;
    }

    if (!chunk.mesh) {
      return;
    }

    chunk.mesh.material = this.cloneMaterial(chunk.mesh.material);
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

  private disposeMaterialOnce(material: THREE.Material | THREE.Material[], disposed: Set<THREE.Material>): void {
    const materials = Array.isArray(material) ? material : [material];
    materials.forEach((item) => {
      if (disposed.has(item)) {
        return;
      }
      disposed.add(item);
      item.dispose();
    });
  }

  private spawnDebris(chunk: RuntimeChunk, impactCenter?: THREE.Vector3): void {
    const parent = this.root.parent;
    if (!parent) {
      return;
    }

    const size = chunk.box.getSize(new THREE.Vector3());
    const longestSide = Math.max(size.x, size.y, size.z);
    if (longestSide < DESTRUCTIBLE_DEBRIS_MIN_DIMENSION) {
      return;
    }

    const visualSize = new THREE.Vector3(
        Math.max(size.x, DESTRUCTIBLE_DEBRIS_MIN_VISIBLE_THICKNESS),
        Math.max(size.y, DESTRUCTIBLE_DEBRIS_MIN_VISIBLE_THICKNESS),
        Math.max(size.z, DESTRUCTIBLE_DEBRIS_MIN_VISIBLE_THICKNESS),
    );
    const geometry = new THREE.BoxGeometry(visualSize.x, visualSize.y, visualSize.z);
    const material = this.createDebrisMaterial(chunk);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${chunk.id}:falling-debris`;
    mesh.position.copy(chunk.center);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;

    const seed = this.hash01(chunk.id, 1);
    const angle = seed * Math.PI * 2;
    const outward = impactCenter
      ? chunk.center.clone().sub(impactCenter)
      : new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
    if (outward.lengthSq() < 0.001) {
      outward.set(Math.cos(angle), Math.sin(angle), 0);
    }
    outward.z = 0;
    outward.normalize();

    const lateralSpeed = 18 + this.hash01(chunk.id, 2) * 46;
    const debris: FallingDebris = {
      mesh,
      velocity: new THREE.Vector3(
          outward.x * lateralSpeed,
          outward.y * lateralSpeed,
          18 + this.hash01(chunk.id, 3) * 36,
      ),
      angularVelocity: new THREE.Vector3(
          (this.hash01(chunk.id, 4) - 0.5) * 2.2,
          (this.hash01(chunk.id, 5) - 0.5) * 2.2,
          (this.hash01(chunk.id, 6) - 0.5) * 3.2,
      ),
      centerGroundOffset: visualSize.z / 2,
      age: 0,
      settledAge: 0,
      settled: false,
      bounces: 0,
    };

    parent.add(mesh);
    this.fallingDebris.push(debris);
    this.pruneFallingDebris();
  }

  private updateFallingDebris(delta: number, groundHeightAt: (x: number, y: number) => number): void {
    if (this.fallingDebris.length === 0) {
      return;
    }

    const step = Math.min(delta, 0.05);
    for (let index = this.fallingDebris.length - 1; index >= 0; index -= 1) {
      const debris = this.fallingDebris[index];
      debris.age += step;

      if (!debris.settled) {
        debris.velocity.z = Math.max(
            -DESTRUCTIBLE_DEBRIS_MAX_FALL_SPEED,
            debris.velocity.z - DESTRUCTIBLE_DEBRIS_GRAVITY * step,
        );
        debris.mesh.position.addScaledVector(debris.velocity, step);
        debris.mesh.rotation.x += debris.angularVelocity.x * step;
        debris.mesh.rotation.y += debris.angularVelocity.y * step;
        debris.mesh.rotation.z += debris.angularVelocity.z * step;

        const groundCenterZ = groundHeightAt(debris.mesh.position.x, debris.mesh.position.y) + debris.centerGroundOffset;
        if (debris.mesh.position.z <= groundCenterZ) {
          debris.mesh.position.z = groundCenterZ;
          if (debris.bounces === 0 && Math.abs(debris.velocity.z) > 150) {
            debris.velocity.z = Math.abs(debris.velocity.z) * 0.16;
            debris.velocity.x *= 0.35;
            debris.velocity.y *= 0.35;
            debris.angularVelocity.multiplyScalar(0.45);
            debris.bounces += 1;
          } else {
            debris.velocity.set(0, 0, 0);
            debris.angularVelocity.multiplyScalar(0.12);
            debris.settled = true;
          }
        }

        continue;
      }

      debris.settledAge += step;
      if (debris.settledAge > DESTRUCTIBLE_DEBRIS_SETTLE_LIFETIME) {
        const fade = THREE.MathUtils.clamp(
            1 - (debris.settledAge - DESTRUCTIBLE_DEBRIS_SETTLE_LIFETIME) / DESTRUCTIBLE_DEBRIS_FADE_DURATION,
            0,
            1,
        );
        this.setDebrisOpacity(debris.mesh, fade);
        if (fade <= 0) {
          this.fallingDebris.splice(index, 1);
          this.disposeDebris(debris);
        }
      }
    }
  }

  private createDebrisMaterial(chunk: RuntimeChunk): THREE.Material {
    const source = Array.isArray(chunk.material)
      ? chunk.material[0]
      : (chunk.material ?? (Array.isArray(chunk.batch?.material) ? chunk.batch.material[0] : chunk.batch?.material));
    const material = source ? source.clone() : new THREE.MeshStandardMaterial({color: 0x8a755d, roughness: 0.92});

    if (material instanceof THREE.MeshStandardMaterial) {
      material.color.lerp(new THREE.Color(0x5b4a3a), 0.16);
      material.roughness = Math.max(material.roughness, 0.84);
      material.metalness = Math.min(material.metalness, 0.05);
      material.transparent = true;
      material.opacity = 0.96;
      material.depthWrite = true;
      material.needsUpdate = true;
    }

    return material;
  }

  private setDebrisOpacity(mesh: THREE.Mesh, opacity: number): void {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      material.transparent = true;
      material.opacity = opacity;
      material.needsUpdate = true;
    });
  }

  private disposeDebris(debris: FallingDebris): void {
    debris.mesh.parent?.remove(debris.mesh);
    debris.mesh.geometry.dispose();
    if (Array.isArray(debris.mesh.material)) {
      debris.mesh.material.forEach((material) => material.dispose());
    } else {
      debris.mesh.material.dispose();
    }
  }

  private pruneFallingDebris(): void {
    while (this.fallingDebris.length > DESTRUCTIBLE_DEBRIS_MAX_ACTIVE) {
      let removeIndex = this.fallingDebris.findIndex((debris) => debris.settled);
      if (removeIndex < 0) {
        removeIndex = 0;
      }
      const [removed] = this.fallingDebris.splice(removeIndex, 1);
      if (removed) {
        this.disposeDebris(removed);
      }
    }
  }

  private hash01(input: string, salt: number): number {
    let hash = 2166136261 ^ salt;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0) / 4294967295;
  }

  private setChunkRenderVisible(chunk: RuntimeChunk, visible: boolean): void {
    if (chunk.visible === visible) {
      return;
    }
    chunk.visible = visible;
    if (chunk.batch && chunk.batchInstanceId !== null) {
      chunk.batch.setVisibleAt(chunk.batchInstanceId, visible && chunk.active);
      return;
    }
    if (chunk.mesh) {
      chunk.mesh.visible = visible && chunk.active;
    }
  }
}
