import * as THREE from 'three';
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
  features: TerrainFeature[];
};

export class Ground extends BaseObject {
  mesh: THREE.Mesh;
  planeSize: number;
  terrain: TerrainData;

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

    this.planeSize = planeSize;
    this.terrain = terrain;
    const terrainResolution = Math.max(8, Math.min(terrain.resolution ?? 96, 256));
    const planeGeometry = new THREE.PlaneGeometry(this.planeSize, this.planeSize, terrainResolution, terrainResolution);
    const positions = planeGeometry.attributes.position;
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      positions.setZ(index, this.heightAt(x, y));
    }
    positions.needsUpdate = true;
    planeGeometry.computeVertexNormals();

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
    return this.terrain.features.reduce((height, feature) => height + this.featureHeightAt(feature, x, y), 0);
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
}
