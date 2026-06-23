export type GroundfireTextureSet = {
  key: string;
  label: string;
  color: string;
  friction?: number;
  maps?: {
    albedo?: string;
    ao?: string;
    height?: string;
    metallic?: string;
    normal?: string;
    roughness?: string;
    damagedAlbedo?: string;
    destroyAlbedo1?: string;
    destroyAlbedo2?: string;
    destroyAlbedo3?: string;
  };
};

export type GroundfireElementPreset = {
  key: string;
  label: string;
  type: 'wall' | 'building' | 'obstacle';
  size: readonly [number, number, number];
  material: string;
  destructible: {
    enabled: boolean;
    health: number;
  };
};

export const MAP_ASSET_MANIFEST = {
  terrainTextureSets: [
    {
      key: 'grassy-meadow',
      label: 'Grassy Meadow',
      color: '#7c8f45',
      friction: 1,
      maps: {
        albedo: '/battletanks/grassy-meadow1-bl/grassy-meadow1_albedo.png',
        ao: '/battletanks/grassy-meadow1-bl/grassy-meadow1_ao.png',
        height: '/battletanks/grassy-meadow1-bl/grassy-meadow1_height.png',
        metallic: '/battletanks/grassy-meadow1-bl/grassy-meadow1_metallic.png',
        normal: '/battletanks/grassy-meadow1-bl/grassy-meadow1_normal-ogl.png',
        roughness: '/battletanks/grassy-meadow1-bl/grassy-meadow1_roughness.png',
      },
    },
    {
      key: 'asphalt-road',
      label: 'Asphalt Road',
      color: '#303431',
      friction: 1.08,
    },
    {
      key: 'dirt-road',
      label: 'Dirt Road',
      color: '#806746',
      friction: 0.82,
    },
    {
      key: 'mud-track',
      label: 'Mud Track',
      color: '#4b3b2b',
      friction: 0.56,
    },
    {
      key: 'height-ramp-field',
      label: 'Height Ramp Field',
      color: '#6f7f39',
      friction: 0.95,
    },
  ] satisfies GroundfireTextureSet[],
  materials: [
    {
      key: 'brick-wall',
      label: 'Brick Wall',
      color: '#a87952',
      friction: 1,
    },
    {
      key: 'concrete-building',
      label: 'Concrete Building',
      color: '#858170',
      friction: 1,
    },
    {
      key: 'steel-obstacle',
      label: 'Steel Obstacle',
      color: '#586266',
      friction: 1,
    },
    {
      key: 'asphalt-road',
      label: 'Asphalt Road',
      color: '#303431',
      friction: 1.08,
    },
    {
      key: 'dirt-road',
      label: 'Dirt Road',
      color: '#806746',
      friction: 0.82,
    },
    {
      key: 'water-clear',
      label: 'Clear Water',
      color: '#35a9c6',
      friction: 0.45,
    },
  ] satisfies GroundfireTextureSet[],
  elementPresets: [
    {
      key: 'brick-wall-short',
      label: 'Brick wall 50',
      type: 'wall',
      size: [120, 20, 50],
      material: 'brick-wall',
      destructible: {enabled: true, health: 20},
    },
    {
      key: 'brick-wall-tall',
      label: 'Brick wall 150',
      type: 'wall',
      size: [160, 22, 150],
      material: 'brick-wall',
      destructible: {enabled: true, health: 60},
    },
    {
      key: 'building-block',
      label: 'Building block',
      type: 'building',
      size: [90, 90, 60],
      material: 'concrete-building',
      destructible: {enabled: true, health: 45},
    },
    {
      key: 'steel-crate',
      label: 'Steel obstacle',
      type: 'obstacle',
      size: [70, 70, 45],
      material: 'steel-obstacle',
      destructible: {enabled: true, health: 35},
    },
  ] satisfies GroundfireElementPreset[],
} as const;

export type MapAssetManifest = typeof MAP_ASSET_MANIFEST;
