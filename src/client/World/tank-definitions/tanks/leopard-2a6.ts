import * as THREE from 'three';
import parts from '../shared/common-parts';

export default {
  id: 'leopard-2a6',
  name: 'Leopard 2A6',
  role: 'Long Gun Sniper',
  description: 'German Leopard 2 upgrade centered around the longer Rheinmetall 120 mm L/55 gun and improved protection packages.',
  origin: 'Developed in Germany from the Leopard 2A5 as a firepower-focused upgrade for greater long-range performance.',
  year: 2001,
  country: 'Germany',
  modelPath: '/battletanks/tanks/leopard-2a6/scene.gltf',
  visualTargetLength: 82,
  visualRotation: new THREE.Euler(0, 0, 0),
  parts,
};
