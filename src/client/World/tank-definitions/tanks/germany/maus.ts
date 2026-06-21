import * as THREE from 'three';
import parts from '../../shared/common-parts';

export default {
  id: 'maus',
  name: 'Panzer VIII Maus',
  role: 'Super Heavy',
  description: 'German super-heavy prototype with extreme armor, a 128 mm main gun, and very poor mobility.',
  origin: 'Developed in Germany as an experimental super-heavy breakthrough tank program near the end of World War II.',
  year: 1944,
  country: 'Germany',
  modelPath: '/battletanks/tanks/maus/scene.gltf',
  visualTargetLength: 92,
  visualRotation: new THREE.Euler(0, 0, 0),
  parts,
};
