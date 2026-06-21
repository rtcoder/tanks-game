import * as THREE from 'three';

export type TankDefinition = {
  id: string;
  name: string;
  role: string;
  description: string;
  modelPath: string;
  visualTargetLength: number;
  visualRotation: THREE.Euler;
  visualScale?: THREE.Vector3;
  parts?: {
    turret?: string[];
    barrel?: string[];
    leftTrack?: string[];
    rightTrack?: string[];
  };
};

export const TANK_DEFINITIONS: TankDefinition[] = [
  {
    id: 't55am1',
    name: 'T-55AM-1',
    role: 'Classic Assault',
    description: 'Low Cold War profile with a rounded cast turret, compact hull, and old-school battlefield silhouette.',
    modelPath: '/battletanks/tanks/t55am1/scene.gltf',
    visualTargetLength: 72,
    visualRotation: new THREE.Euler(0, 0, 0),
    parts: {
      turret: ['turret'],
      barrel: ['barrel'],
      leftTrack: ['left_track'],
      rightTrack: ['right_track'],
    },
  },
  {
    id: 't72b',
    name: 'T-72B',
    role: 'Low Profile Brawler',
    description: 'Flat aggressive hull, reactive armor blocks, and a compact turret built for close maze fights.',
    modelPath: '/battletanks/tanks/t72b/scene.gltf',
    visualTargetLength: 76,
    visualRotation: new THREE.Euler(0, 0, 0),
    parts: {
      turret: ['turret'],
      barrel: ['barrel'],
      leftTrack: ['left_track'],
      rightTrack: ['right_track'],
    },
  },
  {
    id: 'm1-abrams',
    name: 'M1A2 Abrams',
    role: 'Desert MBT',
    description: 'Sand-colored Abrams-inspired heavy tank with a broad hull, angular turret, and long 120 mm gun.',
    modelPath: '/battletanks/tanks/m1-abrams/scene.gltf',
    visualTargetLength: 86,
    visualRotation: new THREE.Euler(0, 0, 0),
    parts: {
      turret: ['turret'],
      barrel: ['barrel'],
      leftTrack: ['left_track'],
      rightTrack: ['right_track'],
    },
  },
  {
    id: 'leopard-2a6',
    name: 'Leopard 2A6',
    role: 'Long Gun Sniper',
    description: 'Long European MBT profile with a boxy turret, heavy side skirts, and an extended smoothbore gun.',
    modelPath: '/battletanks/tanks/leopard-2a6/scene.gltf',
    visualTargetLength: 82,
    visualRotation: new THREE.Euler(0, 0, 0),
    parts: {
      turret: ['turret'],
      barrel: ['barrel'],
      leftTrack: ['left_track'],
      rightTrack: ['right_track'],
    },
  },
  {
    id: 'merkava-mk4',
    name: 'Merkava Mk.4',
    role: 'Defender',
    description: 'Rear-turret armored defender with a bulky front engine deck and heavy protected hull.',
    modelPath: '/battletanks/tanks/merkava-mk4/scene.gltf',
    visualTargetLength: 80,
    visualRotation: new THREE.Euler(0, 0, 0),
    parts: {
      turret: ['turret'],
      barrel: ['barrel'],
      leftTrack: ['left_track'],
      rightTrack: ['right_track'],
    },
  },
];

export const DEFAULT_TANK_ID = TANK_DEFINITIONS[0].id;

export const getTankDefinition = (id: string | null | undefined): TankDefinition => (
  TANK_DEFINITIONS.find((definition) => definition.id === id) ?? TANK_DEFINITIONS[0]
);
