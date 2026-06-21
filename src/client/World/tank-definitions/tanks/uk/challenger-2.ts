import * as THREE from 'three';
import parts from '../../shared/common-parts';

export default {
  id: 'challenger-2',
  name: 'Challenger 2',
  role: 'Heavy Defender',
  description: 'British main battle tank known for Dorchester armor protection and a rifled 120 mm main gun.',
  origin: 'Developed in the United Kingdom by Vickers Defence Systems as the successor to Challenger 1.',
  year: 1998,
  country: 'United Kingdom',
  modelPath: '/battletanks/tanks/challenger-2/scene.gltf',
  visualTargetLength: 82,
  visualRotation: new THREE.Euler(0, 0, 0),
  parts,
};
