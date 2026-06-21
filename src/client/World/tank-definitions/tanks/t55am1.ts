import * as THREE from 'three';
import parts from '../shared/common-parts';

export default {
  id: 't55am1',
  name: 'T-55AM-1',
  role: 'Classic Assault',
  description: 'Soviet T-55 modernization with added armor, fire-control upgrades, and improved survivability for late Cold War service.',
  origin: 'Modernized from the Soviet T-55 family as the T-55AM upgrade line, intended to keep older medium tanks useful against newer NATO armor.',
  year: 1983,
  country: 'Soviet Union',
  modelPath: '/battletanks/tanks/t55am1/scene.gltf',
  visualTargetLength: 72,
  visualRotation: new THREE.Euler(0, 0, 0),
  parts,
}
