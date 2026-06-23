import * as THREE from 'three';

const round = (value) => Number(value.toFixed(6));
const vector = (values) => values.map(round);

const box = (width, length, height) => new THREE.BoxGeometry(width, length, height);

const cylinder = (radiusTop, radiusBottom, depth, radialSegments = 24) => (
    new THREE.CylinderGeometry(radiusTop, radiusBottom, depth, radialSegments)
);

const material = (name, color, roughness = 0.78, metalness = 0.12) => {
  const mat = new THREE.MeshStandardMaterial({color, roughness, metalness});
  mat.name = name;
  return mat;
};

const mesh = (name, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) => {
  const item = new THREE.Mesh(geometry, material);
  item.name = name;
  item.position.set(...position);
  item.rotation.set(...rotation);
  item.scale.set(...scale);
  item.castShadow = true;
  item.receiveShadow = true;
  return item;
};

export {  vector, box, cylinder ,material, mesh};
