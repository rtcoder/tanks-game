import * as THREE from 'three';
import parts from '../../shared/common-parts';

export default {
  id: 'merkava-mk4',
  name: 'Merkava Mk.4',
  role: 'Defender',
  description: 'Israeli Merkava generation with modular armor, advanced electronics, and design emphasis on crew protection.',
  origin: 'Developed in Israel as the fourth major Merkava generation, continuing the front-engine layout and survivability-first doctrine.',
  year: 2004,
  country: 'Israel',
  modelPath: '/battletanks/tanks/merkava-mk4/scene.gltf',
  visualTargetLength: 80,
  visualRotation: new THREE.Euler(0, 0, 0),
  parts,
};
