import * as THREE from 'three';
import parts from '../shared/common-parts';

export default {
  id: 'pl-01',
  name: 'PL-01 Concept',
  role: 'Stealth Concept',
  description: 'Polish concept light tank/direct-fire vehicle with a futuristic low-profile unmanned turret presentation.',
  origin: 'Presented in Poland by OBRUM and BAE Systems as a technology demonstrator for a stealthy future armored vehicle.',
  year: 2013,
  country: 'Poland',
  modelPath: '/battletanks/tanks/pl-01/scene.gltf',
  visualTargetLength: 74,
  visualRotation: new THREE.Euler(0, 0, 0),
  parts,
};
