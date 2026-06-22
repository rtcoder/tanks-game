import type {
  GroundfireMap,
  GroundfireMapElement,
  GroundfireSpawn,
  GroundfireTerrain,
  GroundfireTerrainFeature,
  GroundfireVector3,
  GroundfireWaterGameplay,
  GroundfireWaterSource,
} from './types';

type LegacyWall = {
  id?: unknown;
  kind?: unknown;
  size?: unknown;
  position?: unknown;
  rotation?: unknown;
  destructible?: unknown;
  health?: unknown;
};

type LegacyMap = {
  id?: unknown;
  name?: unknown;
  version?: unknown;
  arena?: {
    size?: unknown;
  };
  terrain?: Partial<GroundfireTerrain> & {
    resolution?: unknown;
    features?: unknown;
    heightmapAsset?: unknown;
    heightScale?: unknown;
    heightOffset?: unknown;
    material?: unknown;
  };
  materials?: unknown;
  walls?: unknown;
  elements?: unknown;
  groups?: unknown;
  water?: unknown;
  spawns?: unknown;
};

const DEFAULT_ARENA_SIZE = 1500;
const DEFAULT_TERRAIN: GroundfireTerrain = {
  resolution: 128,
  material: {
    type: 'texture-set',
    textureSet: 'grassy-meadow',
  },
  features: [],
};

export function normalizeGroundfireMap(source: unknown, fallbackId = 'default'): GroundfireMap {
  const map = source as LegacyMap;
  const arenaSize = readNumber(map?.arena?.size, DEFAULT_ARENA_SIZE);
  const id = readId(map?.id, fallbackId);
  const elements = readElements(map?.elements);
  const legacyElements = elements.length > 0 ? [] : readLegacyWalls(map?.walls);

  return {
    version: 2,
    id,
    name: typeof map?.name === 'string' && map.name.trim() ? map.name.trim() : id,
    arena: {
      size: arenaSize,
    },
    terrain: readTerrain(map?.terrain),
    materials: readMaterials(map?.materials),
    elements: [...elements, ...legacyElements],
    groups: Array.isArray(map?.groups) ? map.groups as GroundfireMap['groups'] : [],
    water: readWaterSources(map?.water),
    spawns: readSpawns(map?.spawns, arenaSize),
  };
}

function readTerrain(source: LegacyMap['terrain']): GroundfireTerrain {
  if (!source) {
    return {...DEFAULT_TERRAIN, features: []};
  }

  return {
    resolution: Math.max(8, Math.min(readNumber(source.resolution, DEFAULT_TERRAIN.resolution), 512)),
    heightmapAsset: typeof source.heightmapAsset === 'string' ? source.heightmapAsset : undefined,
    heightScale: readOptionalNumber(source.heightScale),
    heightOffset: readOptionalNumber(source.heightOffset),
    material: readTerrainMaterial(source.material),
    features: Array.isArray(source.features)
      ? source.features.filter(isTerrainFeature) as GroundfireTerrainFeature[]
      : [],
  };
}

function readMaterials(source: unknown): GroundfireMap['materials'] {
  const materials = source && typeof source === 'object' ? source as Partial<GroundfireMap['materials']> : {};
  return {
    terrain: typeof materials.terrain === 'string' ? materials.terrain : 'grassy-meadow',
    wall: typeof materials.wall === 'string' ? materials.wall : 'brick-wall',
    building: typeof materials.building === 'string' ? materials.building : 'concrete-building',
    obstacle: typeof materials.obstacle === 'string' ? materials.obstacle : 'steel-obstacle',
    water: typeof materials.water === 'string' ? materials.water : 'water-clear',
  };
}

function readTerrainMaterial(source: unknown): GroundfireTerrain['material'] {
  if (!source || typeof source !== 'object') {
    return DEFAULT_TERRAIN.material;
  }

  const material = source as Partial<GroundfireTerrain['material']>;
  if (material.type === 'height-ramp') {
    return {
      type: 'height-ramp',
      colorRamp: Array.isArray(material.colorRamp) ? material.colorRamp : undefined,
    };
  }

  return {
    type: 'texture-set',
    textureSet: typeof material.textureSet === 'string' ? material.textureSet : 'grassy-meadow',
  };
}

function readElements(source: unknown): GroundfireMapElement[] {
  if (!Array.isArray(source)) {
    return [];
  }

  return source
    .map((element, index) => readElement(element, `element-${index}`))
    .filter((element): element is GroundfireMapElement => Boolean(element));
}

function readLegacyWalls(source: unknown): GroundfireMapElement[] {
  if (!Array.isArray(source)) {
    return [];
  }

  return source
    .map((wall, index) => {
      const data = wall as LegacyWall;
      const size = readVector3(data.size, [20, 20, 50]);
      const position = readVector3(data.position, [0, 0, 0]);
      const rotation = readVector3(data.rotation, [0, 0, 0]);
      const destructible = data.destructible !== false;
      return {
        id: readId(data.id, `wall-${index}`),
        type: 'wall',
        position,
        rotation,
        size,
        stacking: {enabled: true, baseElementId: null},
        destructible: {
          enabled: destructible,
          health: readNumber(data.health, destructible ? 20 : 9999),
        },
        material: 'brick-wall',
        role: data.kind === 'boundary' ? 'boundary' : 'maze',
      } satisfies GroundfireMapElement;
    });
}

function readElement(source: unknown, fallbackId: string): GroundfireMapElement | null {
  if (!source || typeof source !== 'object') {
    return null;
  }

  const element = source as Partial<GroundfireMapElement>;
  const elementType = element.type;
  if (elementType !== 'wall' && elementType !== 'building' && elementType !== 'obstacle') {
    return null;
  }

  const destructible = element.destructible ?? {enabled: true, health: 20};
  return {
    id: readId(element.id, fallbackId),
    type: elementType,
    position: readVector3(element.position, [0, 0, 0]),
    rotation: readVector3(element.rotation, [0, 0, 0]),
    size: readVector3(element.size, [80, 20, 50]),
    stacking: {
      enabled: element.stacking?.enabled !== false,
      baseElementId: element.stacking?.baseElementId ?? null,
    },
    destructible: {
      enabled: destructible.enabled !== false,
      health: readNumber(destructible.health, 20),
    },
    material: typeof element.material === 'string' ? element.material : 'brick-wall',
    role: element.role,
  };
}

function readSpawns(source: unknown, arenaSize: number): GroundfireSpawn[] {
  if (Array.isArray(source) && source.length > 0) {
    return source.map((spawn, index) => {
      const data = spawn as Partial<GroundfireSpawn>;
      return {
        id: readId(data.id, `spawn-${index + 1}`),
        position: readVector3(data.position, [0, 0, 0]),
        rotation: readNumber(data.rotation, 0),
      };
    });
  }

  const offset = arenaSize * 0.35;
  return [
    {id: 'spawn-1', position: [-offset, -offset, 0], rotation: 0},
    {id: 'spawn-2', position: [offset, offset, 0], rotation: Math.PI},
    {id: 'spawn-3', position: [-offset, offset, 0], rotation: -Math.PI / 2},
    {id: 'spawn-4', position: [offset, -offset, 0], rotation: Math.PI / 2},
  ];
}

function readWaterSources(source: unknown): GroundfireWaterSource[] {
  if (!Array.isArray(source)) {
    return [];
  }

  return source
    .map((waterSource, index) => readWaterSource(waterSource, `water-${index + 1}`))
    .filter((waterSource): waterSource is GroundfireWaterSource => Boolean(waterSource));
}

function readWaterSource(source: unknown, fallbackId: string): GroundfireWaterSource | null {
  if (!source || typeof source !== 'object') {
    return null;
  }

  const waterSource = source as Partial<GroundfireWaterSource>;
  const waterType = waterSource.type === 'source' || waterSource.type === 'drain' ? waterSource.type : 'basin';
  return {
    id: readId(waterSource.id, fallbackId),
    type: waterType,
    seedPoint: readVector2(waterSource.seedPoint, [0, 0]),
    waterLevel: readNumber(waterSource.waterLevel, 0),
    flowRate: readOptionalNumber(waterSource.flowRate),
    maxVolume: readOptionalNumber(waterSource.maxVolume),
    gameplay: readWaterGameplay(waterSource.gameplay),
    material: typeof waterSource.material === 'string' ? waterSource.material : 'water-clear',
  };
}

function readWaterGameplay(source: unknown): GroundfireWaterGameplay {
  const gameplay = source && typeof source === 'object' ? source as Partial<GroundfireWaterGameplay> : {};
  const projectileImpact = gameplay.projectileImpact === 'pass-through' || gameplay.projectileImpact === 'none'
    ? gameplay.projectileImpact
    : 'splash';
  return {
    blocksMovement: Boolean(gameplay.blocksMovement),
    speedMultiplier: Math.max(0.05, Math.min(readNumber(gameplay.speedMultiplier, 0.45), 1)),
    depthBlockThreshold: Math.max(0, readNumber(gameplay.depthBlockThreshold, 28)),
    projectileImpact,
    explosionMultiplier: Math.max(0, Math.min(readNumber(gameplay.explosionMultiplier, 0.35), 1)),
  };
}

function isTerrainFeature(feature: unknown): boolean {
  if (!feature || typeof feature !== 'object') {
    return false;
  }

  const type = (feature as {type?: unknown}).type;
  return type === 'hill' || type === 'depression' || type === 'ridge';
}

function readId(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readVector3(value: unknown, fallback: GroundfireVector3): GroundfireVector3 {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return [
    readNumber(value[0], fallback[0]),
    readNumber(value[1], fallback[1]),
    readNumber(value[2], fallback[2]),
  ];
}

function readVector2(value: unknown, fallback: [number, number]): [number, number] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return [
    readNumber(value[0], fallback[0]),
    readNumber(value[1], fallback[1]),
  ];
}

function readNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function readOptionalNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
