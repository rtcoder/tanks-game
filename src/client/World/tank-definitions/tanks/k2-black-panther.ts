import * as THREE from 'three';
import parts from '../shared/common-parts';

export default {
  id: 'k2-black-panther',
  name: 'K2 Black Panther',
  role: 'Tech Striker',
  description: 'South Korean main battle tank with advanced fire control, active suspension, and modern composite armor.',
  origin: 'Developed in South Korea by Hyundai Rotem as a domestic next-generation MBT for the Republic of Korea Army.',
  year: 2014,
  country: 'South Korea',
  modelPath: '/battletanks/tanks/k2-black-panther/scene.gltf',
  visualTargetLength: 78,
  visualRotation: new THREE.Euler(0, 0, 0),
  parts,
};
