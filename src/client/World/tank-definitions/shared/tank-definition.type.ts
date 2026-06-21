import * as THREE from 'three';

export type TankDefinitionParts = {
  turret?: string[];
  barrel?: string[];
  leftTrack?: string[];
  rightTrack?: string[];
};

export type TankGameplayStats = {
  hasRotatingTurret: boolean;
  maxHealth: number;
  defense: number;
  moveSpeed: number;
  turnSpeed: number;
  turretTraverseDegPerSecond: number;
  aimPitchDegPerSecond: number;
  bulletDamage: number;
  bulletSpeed: number;
  fireCooldownMs: number;
  mainWeapon: string;
  secondaryWeapon?: string;
  specialWeapon?: string;
  traits: string[];
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
  stats: TankGameplayStats;
};
