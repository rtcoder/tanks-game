import * as THREE from 'three';
import parts from '../shared/common-parts';

export default {
  id: 'leclerc',
  name: 'Leclerc',
  role: 'Fast Autoloader',
  description: 'French main battle tank with an autoloader, compact crew arrangement, and strong mobility for its class.',
  origin: 'Developed in France by GIAT Industries to replace the AMX-30 with a modern, highly automated MBT.',
  year: 1992,
  country: 'France',
  modelPath: '/battletanks/tanks/leclerc/scene.gltf',
  visualTargetLength: 76,
  visualRotation: new THREE.Euler(0, 0, 0),
  parts,
};
