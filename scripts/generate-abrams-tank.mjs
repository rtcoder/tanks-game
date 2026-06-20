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

const outputDir = path.resolve('public/battletanks/tanks/m1-abrams');
const outputPath = path.join(outputDir, 'scene.gltf');

const material = (name, color, roughness = 0.76, metalness = 0.08) => {
  const mat = new THREE.MeshStandardMaterial({color, roughness, metalness});
  mat.name = name;
  return mat;
};

const desertArmor = material('desert_sand_composite_armor', 0xc4a36f);
const darkSand = material('shadowed_sand_armor', 0x8f7650);
const trackRubber = material('blackened_track_rubber', 0x171714, 0.94, 0.04);
const trackMetal = material('worn_track_metal', 0x6f6757, 0.7, 0.35);
const barrelMat = material('sand_dusted_gunmetal', 0x5f5b50, 0.65, 0.38);
const opticMat = material('blue_black_thermal_optics', 0x244c58, 0.25, 0.1);

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
root.name = 'm1_abrams_root';

const hull = new THREE.Group();
hull.name = 'hull';
root.add(hull);

hull.add(mesh('hull_lower_slab', box(42, 66, 8), darkSand, [0, 0, 6]));
hull.add(mesh('hull_upper_deck', box(34, 52, 8), desertArmor, [0, 1, 13]));
hull.add(mesh('front_glacis_plate', box(32, 15, 5), desertArmor, [0, 29, 16], [0.32, 0, 0]));
hull.add(mesh('rear_engine_deck', box(35, 16, 4), darkSand, [0, -28, 17]));
hull.add(mesh('left_side_skirt', box(5, 64, 13), desertArmor, [-25, 0, 10]));
hull.add(mesh('right_side_skirt', box(5, 64, 13), desertArmor, [25, 0, 10]));

const leftTrack = new THREE.Group();
leftTrack.name = 'left_track';
leftTrack.position.set(-22, 0, 6);
hull.add(leftTrack);
leftTrack.add(mesh('left_track_block', box(8, 66, 9), trackRubber));

const rightTrack = new THREE.Group();
rightTrack.name = 'right_track';
rightTrack.position.set(22, 0, 6);
hull.add(rightTrack);
rightTrack.add(mesh('right_track_block', box(8, 66, 9), trackRubber));

for (let index = 0; index < 7; index += 1) {
  const y = -27 + index * 9;
  leftTrack.add(mesh(`left_roadwheel_${index}`, cylinder(3.1, 3.1, 1.2, 20), trackMetal, [0, y, -0.2], [0, 0, Math.PI / 2]));
  rightTrack.add(mesh(`right_roadwheel_${index}`, cylinder(3.1, 3.1, 1.2, 20), trackMetal, [0, y, -0.2], [0, 0, Math.PI / 2]));
}

const turret = new THREE.Group();
turret.name = 'turret';
turret.position.set(0, 5, 22);
root.add(turret);

turret.add(mesh('turret_ring', cylinder(11.5, 12.5, 3.2, 36), darkSand, [0, 0, -1]));
turret.add(mesh('turret_main_block', box(28, 24, 10), desertArmor, [0, 0, 4]));
turret.add(mesh('turret_front_cheek_left', box(11, 9, 9), desertArmor, [-8, 11, 4], [0, 0, -0.18]));
turret.add(mesh('turret_front_cheek_right', box(11, 9, 9), desertArmor, [8, 11, 4], [0, 0, 0.18]));
turret.add(mesh('turret_rear_bustle', box(30, 13, 8), darkSand, [0, -17, 5]));
turret.add(mesh('bustle_rack_back', box(31, 2, 7), trackMetal, [0, -25, 6]));
turret.add(mesh('bustle_rack_left', box(2, 13, 7), trackMetal, [-16, -19, 6]));
turret.add(mesh('bustle_rack_right', box(2, 13, 7), trackMetal, [16, -19, 6]));
turret.add(mesh('commander_cupola', cylinder(4, 4.6, 2.6, 24), darkSand, [-7, -2, 12]));
turret.add(mesh('loader_hatch', box(7, 5, 1.8), darkSand, [8, -3, 12]));
turret.add(mesh('thermal_sight_box', box(4, 4, 4), opticMat, [8, 9, 9]));
turret.add(mesh('coaxial_sight', box(2.3, 2.5, 2), opticMat, [-5, 12, 7]));

const barrel = new THREE.Group();
barrel.name = 'barrel';
barrel.position.set(0, 13, 5);
turret.add(barrel);

barrel.add(mesh('mantlet', box(10, 4, 7), darkSand, [0, -1, 0]));
barrel.add(mesh('m256_120mm_tube', cylinder(1.15, 1.35, 44, 28), barrelMat, [0, 21, 0]));
barrel.add(mesh('muzzle_reference_collar', cylinder(1.65, 1.65, 3.2, 28), barrelMat, [0, 43.5, 0]));

const commanderGun = new THREE.Group();
commanderGun.name = 'commander_machine_gun';
commanderGun.position.set(-7, -1, 15);
turret.add(commanderGun);
commanderGun.add(mesh('m2_receiver', box(4, 2, 2), barrelMat));
commanderGun.add(mesh('m2_barrel', cylinder(0.35, 0.35, 9, 12), barrelMat, [0, 5, 0.2]));

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
