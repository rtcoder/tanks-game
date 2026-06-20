import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';

globalThis.FileReader ??= class FileReader {
  result = null;
  onloadend = null;
  async readAsDataURL(blob) {
    const buffer = Buffer.from(await blob.arrayBuffer());
    this.result = `data:${blob.type || 'application/octet-stream'};base64,${buffer.toString('base64')}`;
    this.onloadend?.();
  }
};

const outputDir = path.resolve('public/battletanks/tanks/prototype-mk1');
const outputPath = path.join(outputDir, 'scene.gltf');

const material = (name, color, roughness = 0.78, metalness = 0.12) => {
  const mat = new THREE.MeshStandardMaterial({color, roughness, metalness});
  mat.name = name;
  return mat;
};

const armor = material('olive_drab_armor', 0x596b3f);
const darkArmor = material('dark_side_armor', 0x2f3828);
const trackRubber = material('track_rubber', 0x191d19, 0.92, 0.04);
const trackMetal = material('track_metal', 0x59605a, 0.7, 0.35);
const barrelMat = material('gunmetal_barrel', 0x303632, 0.62, 0.42);
const opticMat = material('cold_blue_optics', 0x68d9ff, 0.25, 0.1);

const mesh = (name, geometry, mat, position = [0, 0, 0], rotation = [0, 0, 0]) => {
  const item = new THREE.Mesh(geometry, mat);
  item.name = name;
  item.position.set(...position);
  item.rotation.set(...rotation);
  item.castShadow = true;
  item.receiveShadow = true;
  return item;
};

const box = (w, l, h) => new THREE.BoxGeometry(w, l, h);
const cylinder = (radiusTop, radiusBottom, depth, radialSegments = 24) => (
  new THREE.CylinderGeometry(radiusTop, radiusBottom, depth, radialSegments)
);

const root = new THREE.Group();
root.name = 'prototype_mk1_root';

const hull = new THREE.Group();
hull.name = 'hull';
root.add(hull);

hull.add(mesh('hull_lower', box(34, 58, 9), darkArmor, [0, 0, 6]));
hull.add(mesh('hull_upper', box(28, 46, 10), armor, [0, 2, 14]));
hull.add(mesh('front_glacis', box(25, 9, 7), armor, [0, 27, 17], [0.22, 0, 0]));
hull.add(mesh('rear_deck', box(26, 10, 5), darkArmor, [0, -24, 17]));

const leftTrack = new THREE.Group();
leftTrack.name = 'left_track';
leftTrack.position.set(-22, 0, 7);
hull.add(leftTrack);
leftTrack.add(mesh('left_track_body', box(8, 62, 10), trackRubber));
leftTrack.add(mesh('left_track_guard', box(9, 55, 3), trackMetal, [0, 0, 7]));

const rightTrack = new THREE.Group();
rightTrack.name = 'right_track';
rightTrack.position.set(22, 0, 7);
hull.add(rightTrack);
rightTrack.add(mesh('right_track_body', box(8, 62, 10), trackRubber));
rightTrack.add(mesh('right_track_guard', box(9, 55, 3), trackMetal, [0, 0, 7]));

for (let y = -24; y <= 24; y += 12) {
  leftTrack.add(mesh(`left_roadwheel_${y}`, cylinder(3.2, 3.2, 1.2, 18), trackMetal, [0, y, -0.2], [0, 0, Math.PI / 2]));
  rightTrack.add(mesh(`right_roadwheel_${y}`, cylinder(3.2, 3.2, 1.2, 18), trackMetal, [0, y, -0.2], [0, 0, Math.PI / 2]));
}

const turret = new THREE.Group();
turret.name = 'turret';
turret.position.set(0, 3, 22);
root.add(turret);

turret.add(mesh('turret_ring', cylinder(10.5, 11.5, 4, 36), darkArmor, [0, 0, -1]));
turret.add(mesh('turret_body', cylinder(12, 14, 12, 48), armor, [0, 0, 4], [Math.PI / 2, 0, 0]));
turret.add(mesh('turret_front_plate', box(19, 4, 8), armor, [0, 10, 4]));
turret.add(mesh('commander_hatch', cylinder(3.8, 4.2, 2.2, 24), darkArmor, [-4.5, -3, 11]));
turret.add(mesh('gunner_optic', box(3, 2, 2), opticMat, [6.5, 8.5, 8]));

const barrel = new THREE.Group();
barrel.name = 'barrel';
barrel.position.set(0, 10.5, 5);
turret.add(barrel);

barrel.add(mesh('barrel_tube', cylinder(1.35, 1.55, 34, 24), barrelMat, [0, 17, 0], [0, 0, Math.PI / 2]));
barrel.add(mesh('barrel_muzzle', cylinder(1.9, 1.9, 4, 24), barrelMat, [0, 35, 0], [0, 0, Math.PI / 2]));
barrel.add(mesh('mantlet', box(9, 4, 6), darkArmor, [0, -1, 0]));

root.updateMatrixWorld(true);

const exporter = new GLTFExporter();
const gltf = await new Promise((resolve, reject) => {
  exporter.parse(
      root,
      resolve,
      reject,
      {
        binary: false,
        trs: false,
        onlyVisible: true,
      },
  );
});

await fs.mkdir(outputDir, {recursive: true});
await fs.writeFile(outputPath, JSON.stringify(gltf, null, 2));
console.log(`Generated ${outputPath}`);
