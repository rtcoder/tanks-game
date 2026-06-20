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
  {
    id: 't55am1',
    name: 'T-55AM-1',
    role: 'Modernized MBT',
    description: 'Soviet T-55 upgrade with added armor, compact silhouette, and a steady 100 mm gun.',
    modelPath: '/battletanks/tanks/t55am1/obj/t55am1_cmd.obj',
    visualTargetLength: 74,
    visualRotation: new THREE.Euler(-Math.PI / 2, 0, Math.PI),
    visualScale: new THREE.Vector3(1, 1, 1.45),
  },
];

export const DEFAULT_TANK_ID = TANK_DEFINITIONS[0].id;

export const getTankDefinition = (id: string | null | undefined): TankDefinition => (
  TANK_DEFINITIONS.find((definition) => definition.id === id) ?? TANK_DEFINITIONS[0]
);
