import * as THREE from 'three';
import parts from '../shared/common-parts';

export default {
  id: '7tp',
  name: '7TP',
  role: 'Interwar Light Tank',
  description: 'Polish light tank developed from the Vickers 6-ton design, noted for its diesel engine and 37 mm Bofors gun.',
  origin: 'Developed in Poland by Panstwowe Zaklady Inzynierii as a domestic improvement of the British Vickers 6-ton tank.',
  year: 1935,
  country: 'Poland',
  modelPath: '/battletanks/tanks/7tp/scene.gltf',
  visualTargetLength: 54,
  visualRotation: new THREE.Euler(0, 0, 0),
  parts,
};
