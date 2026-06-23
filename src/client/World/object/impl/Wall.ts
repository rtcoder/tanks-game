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
  damageAlphaTexture: THREE.CanvasTexture | null = null;
  wallTexture: THREE.Texture | null = null;
  destroyAnimationActive = false;
  destroyAnimationElapsed = 0;
  destroyAnimationFrame = -1;
  destroyAnimationFrameDuration = 0.055;
  destroyAnimationFrameCount = 5;
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
    uv?: [number, number, number, number];
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
      const albedoTexture = cloneWallTexture(texture['albedo']);
      const aoTexture = cloneWallTexture(texture['ao']);
      const heightTexture = cloneWallTexture(texture['height']);
      const metallicTexture = cloneWallTexture(texture['metallic']);
      const normalTexture = cloneWallTexture(texture['normal']);
      const roughnessTexture = cloneWallTexture(texture['roughness']);
      this.wallTexture = albedoTexture;

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
    if (options.uv) {
      this.applyUvRegion(geometry, options.uv);
    }

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

  applyUvRegion(geometry: THREE.BoxGeometry, uvRegion: [number, number, number, number]): void {
    const [offsetU, offsetV, width, height] = uvRegion;
    const uvAttribute = geometry.getAttribute('uv') as THREE.BufferAttribute;
    for (let index = 0; index < uvAttribute.count; index += 1) {
      const u = uvAttribute.getX(index);
      const v = uvAttribute.getY(index);
      uvAttribute.setXY(index, offsetU + u * width, offsetV + v * height);
    }
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
        material.map = this.createDamageTexture(damageRatio, false);
        material.alphaMap = this.createDamageAlphaTexture(damageRatio, false);
        material.transparent = true;
        material.alphaTest = 0.18;
        material.depthWrite = true;
        material.side = THREE.FrontSide;
        material.color.set(new THREE.Color(0xffffff).lerp(new THREE.Color(0x8d8372), damageRatio * 0.16));
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
        this.destroyAnimationFrameCount - 1,
        Math.floor(this.destroyAnimationElapsed / this.destroyAnimationFrameDuration),
    );

    if (nextFrame !== this.destroyAnimationFrame) {
      this.destroyAnimationFrame = nextFrame;
      this.applyDestroyFrame(nextFrame);
    }

    if (this.destroyAnimationElapsed >= this.destroyAnimationFrameCount * this.destroyAnimationFrameDuration) {
      this.removeMesh();
    }
  }

  startDestroyAnimation(): void {
    if (this.destroyAnimationActive || this.removed) {
      return;
    }

    this.destroyAnimationActive = true;
    this.destroyAnimationElapsed = 0;
    this.destroyAnimationFrame = -1;
    this.applyDestroyFrame(0);
  }

  applyDestroyFrame(frameIndex: number): void {
    const progress = this.destroyAnimationFrameCount <= 1
      ? 1
      : frameIndex / (this.destroyAnimationFrameCount - 1);
    const damageTexture = this.createDamageTexture(0.72 + progress * 0.28, true);
    const damageAlphaTexture = this.createDamageAlphaTexture(0.72 + progress * 0.28, true);

    const materials = Array.isArray(this.mesh.material) ? this.mesh.material : [this.mesh.material];
    materials.forEach((material) => {
      if (material instanceof THREE.MeshStandardMaterial) {
        material.map = damageTexture;
        material.alphaMap = damageAlphaTexture;
        material.transparent = true;
        material.alphaTest = 0.12;
        material.depthWrite = true;
        material.side = THREE.FrontSide;
        material.color.set(new THREE.Color(0xffffff).lerp(new THREE.Color(0x2b211c), progress * 0.42));
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

  createDamageTexture(damageRatio: number, destructive = false): THREE.CanvasTexture {
    this.damageTexture?.dispose();

    const clampedDamage = THREE.MathUtils.clamp(damageRatio, 0, 1);
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) {
      return new THREE.CanvasTexture(canvas);
    }

    this.drawBaseWallTexture(context, size);

    const scorchCount = Math.max(1, Math.ceil(clampedDamage * 8));
    for (let index = 0; index < scorchCount; index++) {
      const seed = this.hashSeed(index + 100);
      const x = (seed % 1000) / 1000 * size;
      const y = (((seed >>> 7) % 1000) / 1000) * size;
      const radius = Math.max(1, 18 + clampedDamage * 58 + ((seed >>> 13) % 24));
      const gradient = context.createRadialGradient(x, y, 2, x, y, radius);
      gradient.addColorStop(0, `rgba(18, 13, 10, ${0.34 + clampedDamage * 0.42})`);
      gradient.addColorStop(0.62, `rgba(54, 42, 32, ${0.18 + clampedDamage * 0.22})`);
      gradient.addColorStop(1, 'rgba(54, 42, 32, 0)');
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }

    const crackCount = Math.max(2, Math.ceil(clampedDamage * 12));
    context.lineCap = 'round';
    context.lineJoin = 'round';
    for (let index = 0; index < crackCount; index++) {
      const seed = this.hashSeed(index + 200);
      let x = (seed % 1000) / 1000 * size;
      let y = (((seed >>> 6) % 1000) / 1000) * size;
      context.strokeStyle = `rgba(19, 14, 11, ${0.28 + clampedDamage * 0.58})`;
      context.lineWidth = 1 + clampedDamage * 2.1;
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

    this.drawDamageHoleShadows(context, size, clampedDamage, destructive);

    const chipCount = Math.max(2, Math.ceil(clampedDamage * 16));
    for (let index = 0; index < chipCount; index++) {
      const seed = this.hashSeed(index + 300);
      const x = (seed % 1000) / 1000 * size;
      const y = (((seed >>> 5) % 1000) / 1000) * size;
      const radius = Math.max(1, 2 + ((seed >>> 11) % 7));
      context.fillStyle = `rgba(188, 178, 142, ${0.2 + clampedDamage * 0.24})`;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }

    this.damageTexture = new THREE.CanvasTexture(canvas);
    this.configureGeneratedWallTexture(this.damageTexture);
    this.damageTexture.colorSpace = THREE.SRGBColorSpace;
    return this.damageTexture;
  }

  createDamageAlphaTexture(damageRatio: number, destructive = false): THREE.CanvasTexture {
    this.damageAlphaTexture?.dispose();

    const clampedDamage = THREE.MathUtils.clamp(damageRatio, 0, 1);
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) {
      return new THREE.CanvasTexture(canvas);
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size, size);
    context.fillStyle = '#000000';
    this.damageHoles(size, clampedDamage, destructive)
        .forEach((hole) => this.drawJaggedBlob(context, hole.x, hole.y, hole.radius, hole.seed));

    this.damageAlphaTexture = new THREE.CanvasTexture(canvas);
    this.configureGeneratedWallTexture(this.damageAlphaTexture);
    return this.damageAlphaTexture;
  }

  configureGeneratedWallTexture(texture: THREE.Texture): void {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(Math.max(1, this.size.y / 120), Math.max(1, this.size.z / 90));
    texture.center.set(0.5, 0.5);
    texture.rotation = Math.PI;
    texture.needsUpdate = true;
  }

  drawBaseWallTexture(context: CanvasRenderingContext2D, size: number): void {
    const image = this.wallTexture?.image as CanvasImageSource & {
      width?: number;
      height?: number;
      naturalWidth?: number;
      naturalHeight?: number;
    } | undefined;
    const width = image ? image.naturalWidth ?? image.width ?? 0 : 0;
    const height = image ? image.naturalHeight ?? image.height ?? 0 : 0;
    if (image && width > 0 && height > 0) {
      context.drawImage(image, 0, 0, size, size);
      return;
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
  }

  damageHoles(
      size: number,
      damageRatio: number,
      destructive: boolean,
  ): Array<{ x: number; y: number; radius: number; seed: number }> {
    const holeCount = Math.max(1, Math.ceil((destructive ? 10 : 5) * damageRatio));
    const holes: Array<{ x: number; y: number; radius: number; seed: number }> = [];
    for (let index = 0; index < holeCount; index++) {
      const seed = this.hashSeed(index + (destructive ? 700 : 500));
      holes.push({
        seed,
        x: (seed % 1000) / 1000 * size,
        y: (((seed >>> 8) % 1000) / 1000) * size,
        radius: Math.max(4, (destructive ? 18 : 8) + damageRatio * (destructive ? 88 : 46) + ((seed >>> 16) % 24)),
      });
    }
    return holes;
  }

  drawDamageHoleShadows(
      context: CanvasRenderingContext2D,
      size: number,
      damageRatio: number,
      destructive: boolean,
  ): void {
    const holes = this.damageHoles(size, damageRatio, destructive);
    context.save();
    context.globalCompositeOperation = 'source-over';
    holes.forEach((hole) => {
      const gradient = context.createRadialGradient(hole.x, hole.y, Math.max(2, hole.radius * 0.35), hole.x, hole.y, hole.radius * 1.14);
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      gradient.addColorStop(0.58, `rgba(17, 12, 8, ${0.18 + damageRatio * 0.24})`);
      gradient.addColorStop(1, 'rgba(17, 12, 8, 0)');
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(hole.x, hole.y, hole.radius * 1.18, 0, Math.PI * 2);
      context.fill();
    });
    context.restore();
  }

  drawJaggedBlob(
      context: CanvasRenderingContext2D,
      x: number,
      y: number,
      radius: number,
      seed: number,
  ): void {
    const pointCount = 9 + (seed % 7);
    context.beginPath();
    for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {
      const angle = (pointIndex / pointCount) * Math.PI * 2;
      const noise = 0.64 + (((seed >>> (pointIndex % 18)) % 100) / 100) * 0.62;
      const px = x + Math.cos(angle) * radius * noise;
      const py = y + Math.sin(angle) * radius * noise;
      if (pointIndex === 0) {
        context.moveTo(px, py);
      } else {
        context.lineTo(px, py);
      }
    }
    context.closePath();
    context.fill();
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
    this.damageAlphaTexture?.dispose();
    this.wallTexture?.dispose();
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
          material.alphaMap,
        ]);
        textureSet.delete(this.wallTexture);
        textureSet.delete(this.damageTexture);
        textureSet.delete(this.damageAlphaTexture);
        textureSet.forEach((texture) => texture?.dispose());
      }
      material.dispose();
    });
    this.mesh.geometry.dispose();
    this.mesh.parent?.remove(this.mesh);
  }
}
