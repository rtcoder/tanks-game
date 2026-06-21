import * as THREE from 'three';
import parts from '../shared/common-parts';

export default {
  id: 't72b',
  name: 'T-72B',
  role: 'Low Profile Brawler',
  description: 'Soviet T-72 variant with improved composite protection, stronger gun-launched missile capability, and Kontakt-era armor upgrades.',
  origin: 'Developed in the Soviet Union as a major T-72 upgrade focused on armor protection and battlefield survivability.',
  year: 1985,
  country: 'Soviet Union',
  modelPath: '/battletanks/tanks/t72b/scene.gltf',
  visualTargetLength: 76,
  visualRotation: new THREE.Euler(0, 0, 0),
  parts,
};
