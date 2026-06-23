import * as THREE from 'three';

export type TankDefinitionParts = {
  turret?: string[];
  barrel?: string[];
  leftTrack?: string[];
  rightTrack?: string[];
};

export type TankWeaponSlot = 'primary' | 'secondary' | 'special';

export type TankWeaponCategory =
  | 'cannon'
  | 'autocannon'
  | 'machine-gun'
  | 'rocket-mortar'
  | 'missile'
  | 'mortar'
  | 'coaxial-gun';

export type TankWeaponDefinition = {
  id: string;
  name: string;
  slot: TankWeaponSlot;
  category: TankWeaponCategory;
  caliberMm?: number;
  damage: number;
  projectileSpeed: number;
  cooldownMs: number;
  splashRadius: number;
  splashMinDamageRatio: number;
  armorPiercing: number;
  notes?: string;
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
  weapons: TankWeaponDefinition[];
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
