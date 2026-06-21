import * as THREE from 'three';
import parts from '../../shared/common-parts';

export default {
  id: 'm60-patton',
  name: 'M60 Patton',
  role: 'Retro Heavy',
  description: 'American Cold War main battle tank evolved from the M48 Patton line with a 105 mm gun and improved hull.',
  origin: 'Developed in the United States as a rapid evolution of the Patton series during the early Cold War.',
  year: 1960,
  country: 'United States',
  modelPath: '/battletanks/tanks/m60-patton/scene.gltf',
  visualTargetLength: 76,
  visualRotation: new THREE.Euler(0, 0, 0),
  parts,
};
