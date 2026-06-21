import * as THREE from 'three';
import parts from '../../shared/common-parts';

export default {
  id: 'pt91-twardy',
  name: 'PT-91 Twardy',
  role: 'Polish MBT',
  description: 'Polish T-72M1 modernization with ERAWA reactive armor, improved fire control, and local systems upgrades.',
  origin: 'Developed in Poland by OBRUM and Bumar-Labedy from the T-72M1 as a domestic main battle tank modernization.',
  year: 1995,
  country: 'Poland',
  modelPath: '/battletanks/tanks/pt91-twardy/scene.gltf',
  visualTargetLength: 76,
  visualRotation: new THREE.Euler(0, 0, 0),
  parts,
};
