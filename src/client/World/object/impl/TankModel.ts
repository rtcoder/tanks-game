import * as THREE from 'three';
import type {TankDefinition} from '../../tankDefinitions';

type TankModelMetrics = {
  bboxParameter: {width: number; height: number; depth: number};
  bulletLocalPos: THREE.Vector3;
};

type TankModelParts = {
  turret: THREE.Object3D | null;
  barrel: THREE.Object3D | null;
  leftTrack: THREE.Object3D[];
  rightTrack: THREE.Object3D[];
};

const PART_NAME_PATTERNS = {
  turret: [/turret/i, /tower/i, /wiezy/i, /wieżycz/i],
  barrel: [/barrel/i, /gun/i, /cannon/i, /lufa/i],
  leftTrack: [/left.*track/i, /track.*left/i, /gąsien.*left/i, /gasien.*left/i],
  rightTrack: [/right.*track/i, /track.*right/i, /gąsien.*right/i, /gasien.*right/i],
};

export class TankModel {
  definition: TankDefinition;
  root: THREE.Object3D;
  parts: TankModelParts = {
    turret: null,
    barrel: null,
    leftTrack: [],
    rightTrack: [],
  };
  metrics: TankModelMetrics;
  originalColor = new THREE.Color(0xffffff);
  trackScroll = 0;

  constructor(sourceMesh: THREE.Object3D, definition: TankDefinition) {
    this.definition = definition;
    this.root = sourceMesh.clone(true);
    this.root.rotation.copy(definition.visualRotation);
    this.prepareMaterials();
    this.parts = this.resolveParts();
    this.metrics = this.normalize();
  }

  dispose(): void {
    this.root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }

      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose());
    });
  }

  setDamageTint(color: THREE.ColorRepresentation): void {
    this.root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }

      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if ('color' in material && material.color instanceof THREE.Color) {
          material.color.set(color);
        }
      });
    });
  }

  clearDamageTint(): void {
    this.root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }

      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if ('color' in material && material.color instanceof THREE.Color) {
          material.color.copy(this.originalColor);
        }
      });
    });
  }

  setTurretYaw(yaw: number): void {
    if (!this.parts.turret) {
      return;
    }

    this.parts.turret.rotation.z = yaw;
  }

  setBarrelPitch(pitch: number): void {
    if (!this.parts.barrel) {
      return;
    }

    this.parts.barrel.rotation.x = -pitch;
  }

  setTrackMotion(distance: number): void {
    this.trackScroll += distance * 0.015;
    [...this.parts.leftTrack, ...this.parts.rightTrack].forEach((track) => {
      track.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) {
          return;
        }

        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
          if ('map' in material && material.map instanceof THREE.Texture) {
            material.map.offset.y = this.trackScroll;
          }
        });
      });
    });
  }

  update(state: {aimPitch: number; movement: number}): void {
    this.setBarrelPitch(state.aimPitch);
    if (state.movement !== 0) {
      this.setTrackMotion(state.movement);
    }
  }

  private prepareMaterials(): void {
    let firstColor: THREE.Color | null = null;

    this.root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }

      child.castShadow = true;
      child.receiveShadow = true;
      if (Array.isArray(child.material)) {
        child.material = child.material.map((material) => material.clone());
        child.material.forEach((material: THREE.Material) => this.cloneMaterialTextures(material));
        firstColor ??= this.findMaterialColor(child.material);
      } else if (child.material) {
        child.material = child.material.clone();
        this.cloneMaterialTextures(child.material);
        if ('color' in child.material && child.material.color instanceof THREE.Color) {
          firstColor ??= child.material.color.clone();
        }
      }
    });

    if (firstColor) {
      this.originalColor.copy(firstColor);
    }
  }

  private normalize(): TankModelMetrics {
    this.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.root);
    const size = new THREE.Vector3();
    box.getSize(size);

    const horizontalLength = Math.max(size.x, size.y);
    if (horizontalLength > 0) {
      this.root.scale.multiplyScalar(this.definition.visualTargetLength / horizontalLength);
    }
    if (this.definition.visualScale) {
      this.root.scale.multiply(this.definition.visualScale);
    }

    this.root.updateMatrixWorld(true);
    const normalizedBox = new THREE.Box3().setFromObject(this.root);
    const normalizedCenter = new THREE.Vector3();
    const normalizedSize = new THREE.Vector3();
    normalizedBox.getCenter(normalizedCenter);
    normalizedBox.getSize(normalizedSize);

    this.root.position.x -= normalizedCenter.x;
    this.root.position.y -= normalizedCenter.y;
    this.root.position.z -= normalizedBox.min.z;

    return {
      bboxParameter: {
        width: Math.max(24, normalizedSize.x * 0.9),
        height: Math.max(42, normalizedSize.y * 0.9),
        depth: Math.max(20, normalizedSize.z * 0.9),
      },
      bulletLocalPos: new THREE.Vector3(
          0,
          Math.max(34, normalizedSize.y * 0.58),
          Math.max(16, normalizedSize.z * 0.72),
      ),
    };
  }

  private resolveParts(): TankModelParts {
    return {
      turret: this.findFirstPart('turret'),
      barrel: this.findFirstPart('barrel'),
      leftTrack: this.findParts('leftTrack'),
      rightTrack: this.findParts('rightTrack'),
    };
  }

  private findFirstPart(part: keyof NonNullable<TankDefinition['parts']>): THREE.Object3D | null {
    return this.findParts(part)[0] ?? null;
  }

  private findParts(part: keyof NonNullable<TankDefinition['parts']>): THREE.Object3D[] {
    const names = this.definition.parts?.[part] ?? [];
    const patterns = PART_NAME_PATTERNS[part] ?? [];
    const matches: THREE.Object3D[] = [];

    this.root.traverse((child) => {
      const childName = child.name.trim();
      if (!childName) {
        return;
      }

      const matchesConfiguredName = names.some((name) => childName === name || childName.includes(name));
      const matchesPattern = patterns.some((pattern) => pattern.test(childName));
      if (matchesConfiguredName || matchesPattern) {
        matches.push(child);
      }
    });

    return matches;
  }

  private findMaterialColor(materials: THREE.Material[]): THREE.Color | null {
    for (const material of materials) {
      if ('color' in material && material.color instanceof THREE.Color) {
        return material.color.clone();
      }
    }
    return null;
  }

  private cloneMaterialTextures(material: THREE.Material): void {
    Object.entries(material).forEach(([key, value]) => {
      if (value instanceof THREE.Texture) {
        (material as unknown as Record<string, THREE.Texture>)[key] = value.clone();
      }
    });
  }
}
