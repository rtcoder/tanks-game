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
