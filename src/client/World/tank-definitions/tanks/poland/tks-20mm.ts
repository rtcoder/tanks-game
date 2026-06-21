import * as THREE from 'three';
import parts from '../../shared/common-parts';

export default {
  id: 'tks-20mm',
  name: 'TK-S 20 mm',
  role: 'Tiny Autocannon',
  description: 'Polish tankette variant armed with the 20 mm wz.38 FK-A autocannon, tiny profile, and very light armor.',
  origin: 'Developed in Poland by up-gunning selected TK-S tankettes shortly before World War II.',
  year: 1939,
  country: 'Poland',
  modelPath: '/battletanks/tanks/tks-20mm/scene.gltf',
  visualTargetLength: 38,
  visualRotation: new THREE.Euler(0, 0, 0),
  parts,
};
