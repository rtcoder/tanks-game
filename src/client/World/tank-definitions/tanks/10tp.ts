import * as THREE from 'three';
import parts from '../shared/common-parts';

export default {
  id: '10tp',
  name: '10TP',
  role: 'Prototype Cruiser',
  description: 'Polish fast tank prototype using Christie-style suspension concepts and a compact pre-war turret layout.',
  origin: 'Developed in Poland as an experimental high-speed cruiser tank program before World War II.',
  year: 1938,
  country: 'Poland',
  modelPath: '/battletanks/tanks/10tp/scene.gltf',
  visualTargetLength: 60,
  visualRotation: new THREE.Euler(0, 0, 0),
  parts,
};
