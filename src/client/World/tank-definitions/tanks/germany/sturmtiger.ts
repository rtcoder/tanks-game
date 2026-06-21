import * as THREE from 'three';
import parts from '../../shared/common-parts';

export default {
  id: 'sturmtiger',
  name: 'Sturmtiger',
  role: 'Siege Mortar',
  description: 'German assault vehicle mounting a 380 mm rocket mortar for close-range demolition work.',
  origin: 'Developed in Germany from Tiger I chassis as a heavy urban assault vehicle for destroying fortifications.',
  year: 1944,
  country: 'Germany',
  modelPath: '/battletanks/tanks/sturmtiger/scene.gltf',
  visualTargetLength: 78,
  visualRotation: new THREE.Euler(0, 0, 0),
  parts,
};
