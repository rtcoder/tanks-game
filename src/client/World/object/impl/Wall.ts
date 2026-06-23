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
  damageTexture: THREE.CanvasTexture | null = null;
  wallTexture: THREE.Texture | null = null;
  damagedWallTexture: THREE.Texture | null = null;
  destroyWallTextures: THREE.Texture[] = [];
  destroyAnimationActive = false;
  destroyAnimationElapsed = 0;
  destroyAnimationFrame = -1;
  destroyAnimationFrameDuration = 0.05;
  removed = false;
  occlusionFadeActive = false;
  falling = false;
  fallVelocity = 0;
  fallStartBottom = 0;

  static onTick = (_wall: Wall, _delta: number) => {};

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
      const wallRepeatX = Math.max(1, size.y / 120);
      const wallRepeatY = Math.max(1, size.z / 90);
      const configureWallTexture = (clonedTexture: THREE.Texture, rotation = Math.PI): THREE.Texture => {
        clonedTexture.wrapS = THREE.RepeatWrapping;
        clonedTexture.wrapT = THREE.RepeatWrapping;
        clonedTexture.repeat.set(wallRepeatX, wallRepeatY);
        clonedTexture.center.set(0.5, 0.5);
        clonedTexture.rotation = rotation;
        clonedTexture.needsUpdate = true;
        return clonedTexture;
      };
      const cloneWallTexture = (source?: THREE.Texture): THREE.Texture | null => {
        if (!source) {
          return null;
        }

        return configureWallTexture(source.clone());
      };
      const cloneRotatedWallTexture = (source?: THREE.Texture): THREE.Texture | null => {
        if (!source?.image) {
          return null;
        }

        const image = source.image as CanvasImageSource & { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number };
        const width = image.naturalWidth ?? image.width ?? 0;
        const height = image.naturalHeight ?? image.height ?? 0;
        if (!width || !height) {
          return cloneWallTexture(source);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) {
          return cloneWallTexture(source);
        }

        context.translate(width, height);
        context.rotate(Math.PI);
        context.drawImage(image, 0, 0, width, height);

        const rotatedTexture = new THREE.CanvasTexture(canvas);
        rotatedTexture.colorSpace = source.colorSpace;
        return configureWallTexture(rotatedTexture, 0);
      };

      const albedoTexture = cloneWallTexture(texture['albedo']);
      const aoTexture = cloneWallTexture(texture['ao']);
      const heightTexture = cloneWallTexture(texture['height']);
      const metallicTexture = cloneWallTexture(texture['metallic']);
      const normalTexture = cloneWallTexture(texture['normal']);
      const roughnessTexture = cloneWallTexture(texture['roughness']);
      this.wallTexture = albedoTexture;
      this.damagedWallTexture = cloneWallTexture(texture['damagedAlbedo']);
      this.destroyWallTextures = [1, 2, 3]
          .map((frame) => cloneRotatedWallTexture(texture[`destroyAlbedo${frame}`]))
          .filter((frameTexture): frameTexture is THREE.Texture => Boolean(frameTexture));

      material.map = albedoTexture;
      material.aoMap = aoTexture;
      material.displacementMap = heightTexture;
      material.metalnessMap = metallicTexture;
      material.normalMap = normalTexture;
      material.roughnessMap = roughnessTexture;
      material.color.set(0xffffff);
    }

    const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    this.rotateLongSideUvsClockwise(geometry, size);

    this.mesh = new THREE.Mesh(
        geometry,
        // new THREE.MeshLambertMaterial({ color: "grey" })
        material,
    );
    this.mesh.position.copy(position);
    this.mesh.rotation.copy(rotation);
    this.mesh.receiveShadow = true;
  }

  rotateLongSideUvsClockwise(geometry: THREE.BoxGeometry, size: THREE.Vector3): void {
    const longSideGroupIndexes = size.y >= size.x ? [0, 1] : [2, 3];
    const uvAttribute = geometry.getAttribute('uv') as THREE.BufferAttribute;
    const indexAttribute = geometry.getIndex();
    const visitedVertices = new Set<number>();

    longSideGroupIndexes.forEach((groupIndex) => {
      const group = geometry.groups[groupIndex];
      if (!group) {
        return;
      }

      for (let offset = group.start; offset < group.start + group.count; offset++) {
        const vertexIndex = indexAttribute ? indexAttribute.getX(offset) : offset;
        if (visitedVertices.has(vertexIndex)) {
          continue;
        }
        visitedVertices.add(vertexIndex);

        const u = uvAttribute.getX(vertexIndex);
        const v = uvAttribute.getY(vertexIndex);
        uvAttribute.setXY(vertexIndex, 1 - v, u);
      }
    });

    uvAttribute.needsUpdate = true;
  }

  damage(amount: number): boolean {
    if (!this.destructible || this.destroyed) {
      return false;
    }

    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) {
      this.destroyed = true;
      this.startDestroyAnimation();
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
        if (this.damagedWallTexture) {
          material.map = this.damagedWallTexture;
          material.transparent = true;
          material.alphaTest = 0.35;
          material.depthWrite = true;
          material.side = THREE.DoubleSide;
          material.color.set(new THREE.Color(0xffffff).lerp(new THREE.Color(0x8d8372), damageRatio * 0.12));
        } else if (material.map && material.map !== this.damageTexture) {
          material.color.set(new THREE.Color(0xffffff).lerp(new THREE.Color(0x5d4937), damageRatio * 0.55));
        } else {
          material.color.set(new THREE.Color(0x827b6c).lerp(new THREE.Color(0x514331), damageRatio * 0.5));
          material.map = this.createDamageTexture(damageRatio);
        }
        this.applyOcclusionMaterialState(material);
      }
    });
  }

  tick(delta: number): void {
    Wall.onTick(this, delta);
  }

  isStructuralActive(): boolean {
    return !this.destroyed && !this.removed && Boolean(this.mesh.parent) && !this.destroyAnimationActive;
  }

  bottomZ(): number {
    return this.mesh.position.z - this.size.z / 2;
  }

  topZ(): number {
    return this.mesh.position.z + this.size.z / 2;
  }

  beginFall(): void {
    if (this.falling || !this.isStructuralActive()) {
      return;
    }

    this.falling = true;
    this.fallVelocity = 0;
    this.fallStartBottom = this.bottomZ();
  }

  updateFall(
      delta: number,
      supportHeight: number,
      gravity: number,
      maxFallSpeed: number,
  ): { distance: number } | null {
    if (!this.falling || !this.isStructuralActive()) {
      return null;
    }

    this.fallVelocity = Math.min(maxFallSpeed, this.fallVelocity + gravity * delta);
    const currentBottom = this.bottomZ();
    const nextBottom = currentBottom - this.fallVelocity * delta;
    if (nextBottom > supportHeight) {
      this.mesh.position.z = nextBottom + this.size.z / 2;
      return null;
    }

    this.mesh.position.z = supportHeight + this.size.z / 2;
    const distance = Math.max(0, this.fallStartBottom - supportHeight);
    this.falling = false;
    this.fallVelocity = 0;
    this.fallStartBottom = 0;
    return {distance};
  }

  update(delta: number): void {
    if (!this.destroyAnimationActive || this.removed) {
      return;
    }

    this.destroyAnimationElapsed += delta;
    const nextFrame = Math.min(
        this.destroyWallTextures.length - 1,
        Math.floor(this.destroyAnimationElapsed / this.destroyAnimationFrameDuration),
    );

    if (nextFrame !== this.destroyAnimationFrame) {
      this.destroyAnimationFrame = nextFrame;
      this.applyDestroyFrame(nextFrame);
    }

    if (this.destroyAnimationElapsed >= this.destroyWallTextures.length * this.destroyAnimationFrameDuration) {
      this.removeMesh();
    }
  }

  startDestroyAnimation(): void {
    if (this.destroyAnimationActive || this.removed) {
      return;
    }

    if (this.destroyWallTextures.length === 0) {
      this.destruct();
      return;
    }

    this.destroyAnimationActive = true;
    this.destroyAnimationElapsed = 0;
    this.destroyAnimationFrame = -1;
    this.applyDestroyFrame(0);
  }

  applyDestroyFrame(frameIndex: number): void {
    const frameTexture = this.destroyWallTextures[frameIndex];
    if (!frameTexture) {
      return;
    }

    const materials = Array.isArray(this.mesh.material) ? this.mesh.material : [this.mesh.material];
    materials.forEach((material) => {
      if (material instanceof THREE.MeshStandardMaterial) {
        material.map = frameTexture;
        material.transparent = true;
        material.alphaTest = 0.35;
        material.side = THREE.DoubleSide;
        material.color.set(0xffffff);
        this.applyOcclusionMaterialState(material);
      }
    });
  }

  setOcclusionFade(active: boolean): void {
    if (this.occlusionFadeActive === active) {
      return;
    }

    this.occlusionFadeActive = active;
    const materials = Array.isArray(this.mesh.material) ? this.mesh.material : [this.mesh.material];
    materials.forEach((material) => {
      if (material instanceof THREE.MeshStandardMaterial) {
        this.applyOcclusionMaterialState(material);
      }
    });
  }

  applyOcclusionMaterialState(material: THREE.MeshStandardMaterial): void {
    const hasCutout = material.alphaTest > 0;
    material.opacity = this.occlusionFadeActive ? 0.28 : 1;
    material.transparent = this.occlusionFadeActive || hasCutout;
    material.depthWrite = !this.occlusionFadeActive;
    material.needsUpdate = true;
  }

  createDamageTexture(damageRatio: number): THREE.CanvasTexture {
    this.damageTexture?.dispose();

    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) {
      return new THREE.CanvasTexture(canvas);
    }

    context.fillStyle = '#80775f';
    context.fillRect(0, 0, size, size);

    for (let y = 0; y < size; y += 32) {
      context.fillStyle = y % 64 === 0 ? '#70684f' : '#8b8268';
      context.fillRect(0, y, size, 2);
    }
    for (let x = 0; x < size; x += 42) {
      context.fillStyle = '#6f674f';
      context.fillRect(x + ((x / 42) % 2) * 18, 0, 2, size);
    }

    const scorchCount = Math.max(1, Math.ceil(damageRatio * 5));
    for (let index = 0; index < scorchCount; index++) {
      const seed = this.hashSeed(index + 100);
      const x = (seed % 1000) / 1000 * size;
      const y = (((seed >>> 7) % 1000) / 1000) * size;
      const radius = Math.max(1, 15 + damageRatio * 36 + ((seed >>> 13) % 14));
      const gradient = context.createRadialGradient(x, y, 2, x, y, radius);
      gradient.addColorStop(0, `rgba(24, 18, 14, ${0.42 + damageRatio * 0.38})`);
      gradient.addColorStop(0.62, `rgba(54, 42, 32, ${0.24 + damageRatio * 0.2})`);
      gradient.addColorStop(1, 'rgba(54, 42, 32, 0)');
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }

    const crackCount = Math.max(2, Math.ceil(damageRatio * 9));
    context.lineCap = 'round';
    context.lineJoin = 'round';
    for (let index = 0; index < crackCount; index++) {
      const seed = this.hashSeed(index + 200);
      let x = (seed % 1000) / 1000 * size;
      let y = (((seed >>> 6) % 1000) / 1000) * size;
      context.strokeStyle = `rgba(19, 14, 11, ${0.35 + damageRatio * 0.55})`;
      context.lineWidth = 1 + damageRatio * 1.3;
      context.beginPath();
      context.moveTo(x, y);
      const steps = 2 + (seed % 3);
      for (let step = 0; step < steps; step++) {
        x += (((seed >>> (step + 9)) % 100) - 50) * 0.75;
        y += 12 + (((seed >>> (step + 14)) % 100) - 50) * 0.35;
        context.lineTo(x, y);
      }
      context.stroke();
    }

    const chipCount = Math.max(2, Math.ceil(damageRatio * 12));
    for (let index = 0; index < chipCount; index++) {
      const seed = this.hashSeed(index + 300);
      const x = (seed % 1000) / 1000 * size;
      const y = (((seed >>> 5) % 1000) / 1000) * size;
      const radius = Math.max(1, 2 + ((seed >>> 11) % 7));
      context.fillStyle = `rgba(188, 178, 142, ${0.25 + damageRatio * 0.28})`;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }

    this.damageTexture = new THREE.CanvasTexture(canvas);
    this.damageTexture.wrapS = THREE.RepeatWrapping;
    this.damageTexture.wrapT = THREE.RepeatWrapping;
    this.damageTexture.repeat.set(Math.max(1, this.size.y / 64), 1);
    this.damageTexture.colorSpace = THREE.SRGBColorSpace;
    return this.damageTexture;
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
    this.removeMesh();
  }

  removeMesh() {
    if (!this.mesh.parent || this.removed) {
      return;
    }
    this.removed = true;
    this.damageTexture?.dispose();
    this.wallTexture?.dispose();
    this.damagedWallTexture?.dispose();
    this.destroyWallTextures.forEach((texture) => texture.dispose());
    const materials = Array.isArray(this.mesh.material) ? this.mesh.material : [this.mesh.material];
    materials.forEach((material) => {
      if (material instanceof THREE.MeshStandardMaterial) {
        const textureSet = new Set([
          material.map,
          material.aoMap,
          material.displacementMap,
          material.metalnessMap,
          material.normalMap,
          material.roughnessMap,
        ]);
        textureSet.delete(this.wallTexture);
        textureSet.delete(this.damagedWallTexture);
        this.destroyWallTextures.forEach((texture) => textureSet.delete(texture));
        textureSet.forEach((texture) => texture?.dispose());
      }
      material.dispose();
    });
    this.mesh.geometry.dispose();
    this.mesh.parent?.remove(this.mesh);
  }
}
