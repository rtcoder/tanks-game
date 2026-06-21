import * as THREE from 'three';
import parts from '../../shared/common-parts';

export default {
  id: 'strv-103',
  name: 'Strv 103',
  role: 'Turretless Sniper',
  description: 'Swedish turretless main battle tank with a fixed 105 mm gun aimed by turning and pitching the hull.',
  origin: 'Developed in Sweden around a low-profile defensive doctrine, using hull aiming instead of a rotating turret.',
  year: 1967,
  country: 'Sweden',
  modelPath: '/battletanks/tanks/strv-103/scene.gltf',
  visualTargetLength: 72,
  visualRotation: new THREE.Euler(0, 0, 0),
  parts,
};
