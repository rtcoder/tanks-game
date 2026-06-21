import * as THREE from 'three';
import parts from '../../shared/common-parts';

export default {
  id: 'm18-hellcat',
  name: 'M18 Hellcat',
  role: 'Glass Cannon',
  description: 'American tank destroyer built around exceptional speed, light armor, and a hard-hitting 76 mm gun.',
  origin: 'Developed in the United States as a fast turreted tank destroyer optimized for hit-and-run anti-armor tactics.',
  year: 1943,
  country: 'United States',
  modelPath: '/battletanks/tanks/m18-hellcat/scene.gltf',
  visualTargetLength: 66,
  visualRotation: new THREE.Euler(0, 0, 0),
  parts,
};
