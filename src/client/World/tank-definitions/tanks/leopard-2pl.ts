import * as THREE from 'three';
import parts from '../shared/common-parts';

export default {
  id: 'leopard-2pl',
  name: 'Leopard 2PL',
  role: 'Polish Upgrade',
  description: 'Polish modernization of Leopard 2A4 tanks with improved turret armor, optics, and onboard systems.',
  origin: 'Developed for Poland as an upgrade package for Polish Leopard 2A4 tanks with domestic and German industry involvement.',
  year: 2020,
  country: 'Poland',
  modelPath: '/battletanks/tanks/leopard-2pl/scene.gltf',
  visualTargetLength: 82,
  visualRotation: new THREE.Euler(0, 0, 0),
  parts,
};
