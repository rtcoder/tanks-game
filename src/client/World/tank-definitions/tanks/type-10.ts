import * as THREE from 'three';
import parts from '../shared/common-parts';

export default {
  id: 'type-10',
  name: 'Type 10',
  role: 'Light MBT',
  description: 'Japanese lightweight main battle tank designed for mobility, modular armor, and modern networked combat.',
  origin: 'Developed in Japan by Mitsubishi Heavy Industries to complement and eventually replace older Type 74 and Type 90 tanks.',
  year: 2012,
  country: 'Japan',
  modelPath: '/battletanks/tanks/type-10/scene.gltf',
  visualTargetLength: 72,
  visualRotation: new THREE.Euler(0, 0, 0),
  parts,
};
