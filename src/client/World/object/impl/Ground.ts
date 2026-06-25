import * as THREE from 'three';
import {MAP_ASSET_MANIFEST} from '../../../../shared/map-assets';
import {BaseObject} from '../BaseObject';

export type TerrainFeature = {
  id: string;
  type: 'hill' | 'depression' | 'ridge';
  center: [number, number];
  radius: number | [number, number];
  height: number;
  rotation?: number;
  falloff?: number;
};

export type TerrainData = {
  resolution: number;
  features?: TerrainFeature[];
  surfacePatches?: Array<{
    id: string;
    shape?: 'circle' | 'rect';
    center: [number, number];
    radius: number;
    size?: [number, number];
    rotation?: number;
    material: string;
    friction: number;
    opacity?: number;
  }>;
  heightmap?: {
    resolution: number;
    samples: number[];
    heightScale: number;
    heightOffset: number;
  };
};

export class Ground extends BaseObject {
  mesh: THREE.Mesh;
  planeSize: number;
  terrain: TerrainData;
  private readonly terrainGeometry: THREE.PlaneGeometry;
  private readonly terrainMaterial: THREE.MeshStandardMaterial;
  private readonly baseMaterialMaps: {
    map: THREE.Texture | null;
    aoMap: THREE.Texture | null;
    displacementMap: THREE.Texture | null;
    metalnessMap: THREE.Texture | null;
    normalMap: THREE.Texture | null;
    roughnessMap: THREE.Texture | null;
  };
  private snowCoverage = 0;

  constructor(name: string, textures: { [key: string]: THREE.Texture }, planeSize: number, terrain: TerrainData) {
    super('ground', name);

    function repeat_texture(
        texture: THREE.Texture,
        num_S: number,
        num_T: number,
    ) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(num_S, num_T);
    }

    const albedoTexture = textures['albedo'];
    const aoTexture = textures['ao'];
    const heightTexture = textures['height'];
    const metallicTexture = textures['metallic'];
    const normalTexture = textures['normal'];
    const roughnessTexture = textures['roughness'];

    repeat_texture(albedoTexture, 10, 10);
    repeat_texture(aoTexture, 10, 10);
    repeat_texture(heightTexture, 10, 10);
    repeat_texture(metallicTexture, 10, 10);
    repeat_texture(normalTexture, 10, 10);
    repeat_texture(roughnessTexture, 10, 10);

    // Set the textures to your material's properties
    const planeMaterial = new THREE.MeshStandardMaterial();
    planeMaterial.map = albedoTexture;
    planeMaterial.aoMap = aoTexture;
    planeMaterial.displacementMap = heightTexture;
    planeMaterial.metalnessMap = metallicTexture;
    planeMaterial.normalMap = normalTexture;
    planeMaterial.roughnessMap = roughnessTexture;

    // Optionally, you can set other texture-related properties
    planeMaterial.displacementScale = 2; // Micro displacement only; map JSON drives playable height.
    planeMaterial.normalScale.set(3, 3); // Adjust this value to control the normal map scale
    this.terrainMaterial = planeMaterial;
    this.baseMaterialMaps = {
      map: planeMaterial.map,
      aoMap: planeMaterial.aoMap,
      displacementMap: planeMaterial.displacementMap,
      metalnessMap: planeMaterial.metalnessMap,
      normalMap: planeMaterial.normalMap,
      roughnessMap: planeMaterial.roughnessMap,
    };

    this.planeSize = planeSize;
    this.terrain = terrain;
    const terrainResolution = Math.max(8, Math.min(terrain.resolution ?? 96, 256));
    const planeGeometry = new THREE.PlaneGeometry(this.planeSize, this.planeSize, terrainResolution, terrainResolution);
    this.terrainGeometry = planeGeometry;
    const positions = planeGeometry.attributes.position;
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      positions.setZ(index, this.heightAt(x, y));
    }
    positions.needsUpdate = true;
    planeGeometry.computeVertexNormals();
    this.applyTerrainColors(0);

    // Add your material to a mesh and add it to the scene
    this.mesh = new THREE.Mesh(planeGeometry, planeMaterial);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
  }

  inBoundary(pos: THREE.Vector3): boolean {
    return (
        pos.x <= this.mesh.position.x + this.planeSize / 2 &&
        pos.x >= this.mesh.position.x - this.planeSize / 2 &&
        pos.y <= this.mesh.position.y + this.planeSize / 2 &&
        pos.y >= this.mesh.position.y - this.planeSize / 2
    );
  }

  heightAt(x: number, y: number): number {
    const heightmapHeight = this.terrain.heightmap ? this.heightmapHeightAt(x, y) : 0;
    return (this.terrain.features ?? []).reduce(
        (height, feature) => height + this.featureHeightAt(feature, x, y),
        heightmapHeight,
    );
  }

  normalAt(x: number, y: number, sampleDistance = 12): THREE.Vector3 {
    const left = this.heightAt(x - sampleDistance, y);
    const right = this.heightAt(x + sampleDistance, y);
    const down = this.heightAt(x, y - sampleDistance);
    const up = this.heightAt(x, y + sampleDistance);
    const tangentX = new THREE.Vector3(sampleDistance * 2, 0, right - left);
    const tangentY = new THREE.Vector3(0, sampleDistance * 2, up - down);
    return tangentX.cross(tangentY).normalize();
  }

  frictionAt(x: number, y: number): number {
    return (this.terrain.surfacePatches ?? []).reduce((friction, patch) => {
      const blend = this.surfacePatchBlendAt(patch, x, y);
      if (blend <= 0) {
        return friction;
      }
      return THREE.MathUtils.lerp(friction, THREE.MathUtils.clamp(patch.friction, 0.05, 3), blend);
    }, 1);
  }

  destruct(): void {
    super.destruct();
  }

  setSnowCoverage(coverage: number): void {
    const nextCoverage = THREE.MathUtils.clamp(coverage, 0, 1);
    if (Math.abs(nextCoverage - this.snowCoverage) < 0.01) {
      return;
    }
    this.snowCoverage = nextCoverage;
    const snowActive = nextCoverage > 0.02;
    if (snowActive) {
      this.terrainMaterial.map = null;
      this.terrainMaterial.aoMap = null;
      this.terrainMaterial.displacementMap = null;
      this.terrainMaterial.metalnessMap = null;
      this.terrainMaterial.normalMap = null;
      this.terrainMaterial.roughnessMap = null;
      this.terrainMaterial.color.set(0xffffff);
      this.terrainMaterial.roughness = THREE.MathUtils.lerp(0.94, 0.82, nextCoverage);
      this.terrainMaterial.metalness = 0;
      this.terrainMaterial.displacementScale = 0;
      this.terrainMaterial.normalScale.setScalar(0.65);
    } else {
      this.terrainMaterial.map = this.baseMaterialMaps.map;
      this.terrainMaterial.aoMap = this.baseMaterialMaps.aoMap;
      this.terrainMaterial.displacementMap = this.baseMaterialMaps.displacementMap;
      this.terrainMaterial.metalnessMap = this.baseMaterialMaps.metalnessMap;
      this.terrainMaterial.normalMap = this.baseMaterialMaps.normalMap;
      this.terrainMaterial.roughnessMap = this.baseMaterialMaps.roughnessMap;
      this.terrainMaterial.color.set(0xffffff);
      this.terrainMaterial.roughness = 1;
      this.terrainMaterial.metalness = 0;
      this.terrainMaterial.displacementScale = 2;
      this.terrainMaterial.normalScale.set(3, 3);
    }
    this.applyTerrainColors(nextCoverage);
    this.terrainMaterial.needsUpdate = true;
  }

  private applyTerrainColors(snowCoverage: number): void {
    const positions = this.terrainGeometry.attributes.position;
    const normals = this.terrainGeometry.attributes.normal;
    const colors = new Float32Array(positions.count * 3);
    const baseColor = new THREE.Color(0xffffff);
    const patchColor = new THREE.Color();
    const snowColor = new THREE.Color(0xf4fbff);
    const compactSnowColor = new THREE.Color(0xd6e0e4);
    const color = new THREE.Color();
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const height = positions.getZ(index);
      color.copy(baseColor);
      this.terrain.surfacePatches?.forEach((patch) => {
        const blend = this.surfacePatchBlendAt(patch, x, y);
        if (blend <= 0) {
          return;
        }
        patchColor.set(this.surfacePatchColor(patch.material));
        color.lerp(patchColor, blend);
      });
      if (snowCoverage > 0) {
        const slopeCoverage = THREE.MathUtils.smoothstep(normals.getZ(index), 0.44, 0.92);
        const heightCoverage = THREE.MathUtils.smoothstep(height, -18, 46);
        const localCoverage = THREE.MathUtils.clamp((slopeCoverage * 0.74 + heightCoverage * 0.26) * snowCoverage, 0, 1);
        patchColor.copy(compactSnowColor).lerp(snowColor, localCoverage);
        color.lerp(patchColor, localCoverage);
      }
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }

    this.terrainGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.terrainMaterial.vertexColors = true;
  }

  private surfacePatchColor(materialKey: string): THREE.ColorRepresentation {
    return MAP_ASSET_MANIFEST.terrainTextureSets.find((material) => material.key === materialKey)?.color ?? '#ffffff';
  }

  private surfacePatchBlendAt(
      patch: NonNullable<TerrainData['surfacePatches']>[number],
      x: number,
      y: number,
  ): number {
    if (patch.shape === 'rect' && patch.size) {
      const rotation = -(patch.rotation ?? 0);
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const dx = x - patch.center[0];
      const dy = y - patch.center[1];
      const localX = dx * cos - dy * sin;
      const localY = dx * sin + dy * cos;
      const halfWidth = patch.size[0] / 2;
      const halfDepth = patch.size[1] / 2;
      if (Math.abs(localX) > halfWidth || Math.abs(localY) > halfDepth) {
        return 0;
      }
      return THREE.MathUtils.clamp(patch.opacity ?? 0.92, 0, 1);
    }

    const distance = Math.hypot(x - patch.center[0], y - patch.center[1]);
    if (distance > patch.radius) {
      return 0;
    }
    const falloff = Math.cos((distance / patch.radius) * Math.PI * 0.5);
    return THREE.MathUtils.clamp((patch.opacity ?? 0.85) * falloff, 0, 1);
  }

  private featureHeightAt(feature: TerrainFeature, x: number, y: number): number {
    const [centerX, centerY] = feature.center;
    const rotation = feature.rotation ?? 0;
    const cos = Math.cos(-rotation);
    const sin = Math.sin(-rotation);
    const localX = (x - centerX) * cos - (y - centerY) * sin;
    const localY = (x - centerX) * sin + (y - centerY) * cos;
    const [radiusX, radiusY] = Array.isArray(feature.radius)
        ? feature.radius
        : [feature.radius, feature.radius];
    const normalizedDistance = Math.sqrt(
        (localX * localX) / (radiusX * radiusX)
        + (localY * localY) / (radiusY * radiusY),
    );
    if (normalizedDistance >= 1) {
      return 0;
    }

    const falloff = Math.max(0.5, feature.falloff ?? 2);
    const smooth = Math.pow(1 - normalizedDistance * normalizedDistance, falloff);
    if (feature.type === 'depression') {
      return -Math.abs(feature.height) * smooth;
    }
    return feature.height * smooth;
  }

  private heightmapHeightAt(x: number, y: number): number {
    const heightmap = this.terrain.heightmap;
    if (!heightmap || heightmap.samples.length === 0) {
      return 0;
    }

    const resolution = heightmap.resolution;
    const u = THREE.MathUtils.clamp((x / this.planeSize) + 0.5, 0, 1);
    const v = THREE.MathUtils.clamp((y / this.planeSize) + 0.5, 0, 1);
    const sampleX = u * (resolution - 1);
    const sampleY = v * (resolution - 1);
    const x0 = Math.floor(sampleX);
    const y0 = Math.floor(sampleY);
    const x1 = Math.min(resolution - 1, x0 + 1);
    const y1 = Math.min(resolution - 1, y0 + 1);
    const tx = sampleX - x0;
    const ty = sampleY - y0;
    const topLeft = this.heightmapSample(x0, y0);
    const topRight = this.heightmapSample(x1, y0);
    const bottomLeft = this.heightmapSample(x0, y1);
    const bottomRight = this.heightmapSample(x1, y1);
    const top = THREE.MathUtils.lerp(topLeft, topRight, tx);
    const bottom = THREE.MathUtils.lerp(bottomLeft, bottomRight, tx);
    return THREE.MathUtils.lerp(top, bottom, ty) * heightmap.heightScale + heightmap.heightOffset;
  }

  private heightmapSample(x: number, y: number): number {
    const heightmap = this.terrain.heightmap;
    if (!heightmap) {
      return 0;
    }

    return heightmap.samples[y * heightmap.resolution + x] ?? 0;
  }
}
