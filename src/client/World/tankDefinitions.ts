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
    id: 'm1-abrams',
    name: 'M1 Abrams',
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
    id: 'prototype-mk1',
    name: 'Prototype Mk I',
    role: 'Test Platform',
    description: 'Generated training tank with separated hull, turret, barrel, and track nodes.',
    modelPath: '/battletanks/tanks/prototype-mk1/scene.gltf',
    visualTargetLength: 78,
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
