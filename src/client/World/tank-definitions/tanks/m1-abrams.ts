import * as THREE from 'three';
import parts from '../shared/common-parts';

export default {
  id: 'm1-abrams',
  name: 'M1A2 Abrams',
  role: 'Desert MBT',
  description: 'American Abrams upgrade introducing improved digital systems, commander thermal sight, and enhanced battlefield awareness.',
  origin: 'Developed in the United States as the digitalized M1 Abrams evolution for modern armored warfare.',
  year: 1992,
  country: 'United States',
  modelPath: '/battletanks/tanks/m1-abrams/scene.gltf',
  visualTargetLength: 86,
  visualRotation: new THREE.Euler(0, 0, 0),
  parts,
};
