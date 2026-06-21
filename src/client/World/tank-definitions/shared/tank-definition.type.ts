import * as THREE from 'three';

export type TankDefinitionParts = {
  turret?: string[];
  barrel?: string[];
  leftTrack?: string[];
  rightTrack?: string[];
};

export type TankDefinition = {
  id: string;
  name: string;
  role: string;
  description: string;
  origin: string;
  year: number;
  country: string;
  modelPath: string;
  visualTargetLength: number;
  visualRotation: THREE.Euler;
  visualScale?: THREE.Vector3;
  parts?: TankDefinitionParts;
};
