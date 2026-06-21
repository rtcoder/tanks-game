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

const tanksRoot = path.resolve('public/battletanks/tanks');

const makeMaterial = (name, color, roughness = 0.76, metalness = 0.1) => {
  const material = new THREE.MeshStandardMaterial({color, roughness, metalness});
  material.name = name;
  return material;
};

const box = (width, length, height) => new THREE.BoxGeometry(width, length, height);
const cyl = (top, bottom, depth, segments = 24) => new THREE.CylinderGeometry(top, bottom, depth, segments);

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

const addTrack = (parent, side, x, length, height, mats, wheels = 6) => {
  const track = new THREE.Group();
  track.name = `${side}_track`;
  track.position.set(x, 0, height * 0.5 + 1);
  parent.add(track);

  track.add(mesh(`${side}_track_rubber`, box(8, length, height), mats.track));
  track.add(mesh(`${side}_track_guard`, box(9.2, length * 0.88, 2.4), mats.trackMetal, [0, 0, height * 0.62]));

  const start = -length * 0.36;
  const step = (length * 0.72) / Math.max(1, wheels - 1);
  for (let index = 0; index < wheels; index += 1) {
    track.add(mesh(
        `${side}_roadwheel_${index}`,
        cyl(2.8, 2.8, 1.3, 20),
        mats.trackMetal,
        [0, start + index * step, -height * 0.2],
        [0, 0, Math.PI / 2],
    ));
  }

  return track;
};

const addBarrel = (turret, spec, mats) => {
  const barrel = new THREE.Group();
  barrel.name = 'barrel';
  barrel.position.set(...spec.origin);
  turret.add(barrel);

  barrel.add(mesh('mantlet', box(spec.mantlet[0], spec.mantlet[1], spec.mantlet[2]), mats.dark, [0, -1, 0]));
  barrel.add(mesh('barrel_tube', cyl(spec.radius * 0.78, spec.radius, spec.length, 28), mats.barrel, [0, spec.length * 0.5, 0]));
  if (spec.muzzle) {
    barrel.add(mesh('muzzle_brake', box(spec.muzzle[0], spec.muzzle[1], spec.muzzle[2]), mats.barrel, [0, spec.length + spec.muzzle[1] * 0.45, 0]));
  } else {
    barrel.add(mesh('muzzle_collar', cyl(spec.radius * 1.35, spec.radius * 1.35, 2.8, 28), mats.barrel, [0, spec.length + 1.4, 0]));
  }

  return barrel;
};

const addEraBlocks = (parent, prefix, count, startX, y, z, dx, size, mat) => {
  for (let index = 0; index < count; index += 1) {
    parent.add(mesh(`${prefix}_era_${index}`, box(...size), mat, [startX + index * dx, y, z]));
  }
};

const addT55 = (root, mats) => {
  const hull = new THREE.Group();
  hull.name = 'hull';
  root.add(hull);

  hull.add(mesh('hull_lower', box(34, 57, 8), mats.dark, [0, 0, 5]));
  hull.add(mesh('hull_upper_low_slab', box(28, 48, 7), mats.armor, [0, 3, 12]));
  hull.add(mesh('front_glacis_low_angle', box(27, 10, 4), mats.armor, [0, 28, 15], [0.28, 0, 0]));
  hull.add(mesh('rear_engine_grille', box(25, 12, 3), mats.dark, [0, -25, 15]));
  hull.add(mesh('left_side_box', box(3.5, 42, 5), mats.armor2, [-18, 0, 14]));
  hull.add(mesh('right_side_box', box(3.5, 42, 5), mats.armor2, [18, 0, 14]));
  hull.add(mesh('left_rear_fuel_drum', cyl(3.2, 3.2, 12, 20), mats.dark, [-11, -34, 13], [Math.PI / 2, 0, 0]));
  hull.add(mesh('right_rear_fuel_drum', cyl(3.2, 3.2, 12, 20), mats.dark, [11, -34, 13], [Math.PI / 2, 0, 0]));

  addTrack(hull, 'left', -21, 59, 9, mats, 5);
  addTrack(hull, 'right', 21, 59, 9, mats, 5);

  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.set(0, 5, 20);
  root.add(turret);
  turret.add(mesh('turret_ring', cyl(10.5, 11.5, 3, 36), mats.dark, [0, 0, -1], [Math.PI / 2, 0, 0]));
  turret.add(mesh('rounded_cast_turret', new THREE.SphereGeometry(12, 32, 16), mats.armor, [0, 0, 4], [0, 0, 0], [1.05, 0.92, 0.52]));
  turret.add(mesh('turret_front_cast_cheek', box(18, 7, 7), mats.armor, [0, 9, 4]));
  turret.add(mesh('commander_cupola', cyl(3.5, 4, 2.4, 24), mats.dark, [-4, -3, 10], [Math.PI / 2, 0, 0]));
  turret.add(mesh('ir_searchlight', cyl(2.2, 2.2, 3.2, 18), mats.optic, [6, 8, 8], [Math.PI / 2, 0, 0]));

  addBarrel(turret, {origin: [0, 11, 4.3], length: 33, radius: 1.25, mantlet: [8, 4, 5], muzzle: [5, 3, 2.2]}, mats);
};

const addT72 = (root, mats) => {
  const hull = new THREE.Group();
  hull.name = 'hull';
  root.add(hull);

  hull.add(mesh('hull_lower', box(37, 61, 8), mats.dark, [0, 0, 5]));
  hull.add(mesh('hull_upper_flat', box(30, 50, 7), mats.armor, [0, 3, 12]));
  hull.add(mesh('sharp_front_glacis', box(30, 13, 4), mats.armor, [0, 29, 15], [0.36, 0, 0]));
  hull.add(mesh('rear_deck', box(29, 14, 3), mats.dark, [0, -27, 15]));
  addEraBlocks(hull, 'front', 6, -13.5, 29, 18, 5.4, [4.2, 2.2, 2.2], mats.era);
  hull.add(mesh('left_skirt', box(4, 58, 8), mats.armor2, [-23, 0, 10]));
  hull.add(mesh('right_skirt', box(4, 58, 8), mats.armor2, [23, 0, 10]));

  addTrack(hull, 'left', -22, 63, 9, mats, 6);
  addTrack(hull, 'right', 22, 63, 9, mats, 6);

  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.set(0, 4, 20.5);
  root.add(turret);
  turret.add(mesh('turret_ring', cyl(11.2, 12, 3, 36), mats.dark, [0, 0, -1], [Math.PI / 2, 0, 0]));
  turret.add(mesh('low_domed_turret', new THREE.SphereGeometry(13, 32, 16), mats.armor, [0, 0, 4], [0, 0, 0], [1.1, 0.95, 0.45]));
  turret.add(mesh('turret_front_wedge', box(20, 8, 6), mats.armor, [0, 10, 4], [0, 0, 0]));
  addEraBlocks(turret, 'turret_left', 3, -9, 9.5, 8, 4.5, [3.2, 2, 2], mats.era);
  addEraBlocks(turret, 'turret_right', 3, 1, 9.5, 8, 4.5, [3.2, 2, 2], mats.era);
  turret.add(mesh('commander_cupola', cyl(3.2, 3.8, 2.1, 24), mats.dark, [-5, -3, 9], [Math.PI / 2, 0, 0]));

  addBarrel(turret, {origin: [0, 11, 4.2], length: 38, radius: 1.18, mantlet: [9, 4, 5]}, mats);
};

const addAbrams = (root, mats) => {
  const hull = new THREE.Group();
  hull.name = 'hull';
  root.add(hull);

  hull.add(mesh('hull_lower_slab', box(42, 66, 8), mats.dark, [0, 0, 6]));
  hull.add(mesh('hull_upper_deck', box(34, 52, 8), mats.armor, [0, 1, 13]));
  hull.add(mesh('front_glacis_plate', box(32, 15, 5), mats.armor, [0, 29, 16], [0.32, 0, 0]));
  hull.add(mesh('rear_engine_deck', box(35, 16, 4), mats.dark, [0, -28, 17]));
  hull.add(mesh('left_side_skirt', box(5, 64, 13), mats.armor2, [-25, 0, 10]));
  hull.add(mesh('right_side_skirt', box(5, 64, 13), mats.armor2, [25, 0, 10]));

  addTrack(hull, 'left', -22, 66, 9, mats, 7);
  addTrack(hull, 'right', 22, 66, 9, mats, 7);

  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.set(0, 5, 22);
  root.add(turret);
  turret.add(mesh('turret_ring', cyl(11.5, 12.5, 3.2, 36), mats.dark, [0, 0, -1], [Math.PI / 2, 0, 0]));
  turret.add(mesh('angular_turret_block', box(28, 24, 10), mats.armor, [0, 0, 4]));
  turret.add(mesh('turret_front_cheek_left', box(11, 9, 9), mats.armor, [-8, 11, 4], [0, 0, -0.18]));
  turret.add(mesh('turret_front_cheek_right', box(11, 9, 9), mats.armor, [8, 11, 4], [0, 0, 0.18]));
  turret.add(mesh('turret_rear_bustle', box(30, 13, 8), mats.dark, [0, -17, 5]));
  turret.add(mesh('thermal_sight_box', box(4, 4, 4), mats.optic, [8, 9, 9]));
  turret.add(mesh('commander_cupola', cyl(4, 4.6, 2.6, 24), mats.dark, [-7, -2, 12], [Math.PI / 2, 0, 0]));

  addBarrel(turret, {origin: [0, 13, 5], length: 44, radius: 1.25, mantlet: [10, 4, 7]}, mats);
};

const addLeopard = (root, mats) => {
  const hull = new THREE.Group();
  hull.name = 'hull';
  root.add(hull);

  hull.add(mesh('long_hull_lower', box(39, 70, 8), mats.dark, [0, 0, 6]));
  hull.add(mesh('long_hull_upper', box(32, 56, 8), mats.armor, [0, 1, 13]));
  hull.add(mesh('angled_nose', box(31, 17, 5), mats.armor, [0, 31, 16], [0.34, 0, 0]));
  hull.add(mesh('rear_engine_grille', box(30, 16, 3), mats.dark, [0, -30, 17]));
  hull.add(mesh('left_heavy_skirt', box(4.8, 68, 12), mats.armor2, [-24, 0, 10]));
  hull.add(mesh('right_heavy_skirt', box(4.8, 68, 12), mats.armor2, [24, 0, 10]));

  addTrack(hull, 'left', -22, 70, 9, mats, 7);
  addTrack(hull, 'right', 22, 70, 9, mats, 7);

  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.set(0, 7, 22);
  root.add(turret);
  turret.add(mesh('turret_ring', cyl(11, 12, 3, 36), mats.dark, [0, 0, -1], [Math.PI / 2, 0, 0]));
  turret.add(mesh('boxy_turret_core', box(25, 26, 10), mats.armor, [0, 0, 4]));
  turret.add(mesh('wedge_front_armor', box(27, 12, 9), mats.armor, [0, 13, 4], [0, 0, 0]));
  turret.add(mesh('left_side_turret_slope', box(5, 23, 9), mats.armor2, [-15, 2, 4], [0, 0, -0.22]));
  turret.add(mesh('right_side_turret_slope', box(5, 23, 9), mats.armor2, [15, 2, 4], [0, 0, 0.22]));
  turret.add(mesh('commander_sight_box', box(5, 5, 4), mats.optic, [-7, 4, 11]));
  turret.add(mesh('panoramic_sight', cyl(2.3, 2.5, 2.4, 18), mats.optic, [7, 1, 12], [Math.PI / 2, 0, 0]));

  addBarrel(turret, {origin: [0, 15, 5], length: 52, radius: 1.1, mantlet: [10, 4, 7]}, mats);
};

const addMerkava = (root, mats) => {
  const hull = new THREE.Group();
  hull.name = 'hull';
  root.add(hull);

  hull.add(mesh('hull_lower', box(43, 68, 9), mats.dark, [0, 0, 6]));
  hull.add(mesh('front_engine_hump', box(36, 29, 10), mats.armor, [0, 20, 15], [0.18, 0, 0]));
  hull.add(mesh('rear_troop_bay_deck', box(34, 35, 8), mats.armor, [0, -17, 14]));
  hull.add(mesh('steep_front_nose', box(33, 15, 5), mats.armor2, [0, 35, 16], [0.45, 0, 0]));
  hull.add(mesh('left_armored_skirt', box(5, 66, 13), mats.armor2, [-25, 0, 10]));
  hull.add(mesh('right_armored_skirt', box(5, 66, 13), mats.armor2, [25, 0, 10]));

  addTrack(hull, 'left', -22, 68, 9, mats, 6);
  addTrack(hull, 'right', 22, 68, 9, mats, 6);

  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.set(0, -8, 23);
  root.add(turret);
  turret.add(mesh('turret_ring', cyl(11, 12, 3, 36), mats.dark, [0, 0, -1], [Math.PI / 2, 0, 0]));
  turret.add(mesh('low_rear_turret_core', box(27, 24, 9), mats.armor, [0, 0, 4]));
  turret.add(mesh('sloped_front_turret', box(25, 12, 8), mats.armor, [0, 12, 4], [0.1, 0, 0]));
  turret.add(mesh('rear_basket', box(29, 12, 6), mats.dark, [0, -18, 5]));
  turret.add(mesh('left_turret_cheek', box(5, 20, 8), mats.armor2, [-15, 2, 4], [0, 0, -0.28]));
  turret.add(mesh('right_turret_cheek', box(5, 20, 8), mats.armor2, [15, 2, 4], [0, 0, 0.28]));
  turret.add(mesh('commander_station', cyl(3.5, 4, 2.5, 24), mats.dark, [-6, -2, 11], [Math.PI / 2, 0, 0]));
  turret.add(mesh('remote_weapon_station', box(4, 5, 3), mats.barrel, [6, -2, 12]));

  addBarrel(turret, {origin: [0, 13, 5], length: 42, radius: 1.2, mantlet: [10, 4, 7]}, mats);
};

const definitions = [
  {
    id: 't55am1',
    name: 'T-55AM-1',
    palette: [0x59613d, 0x3d462f, 0x6d744b],
    build: addT55,
  },
  {
    id: 't72b',
    name: 'T-72B',
    palette: [0x48583a, 0x2b3327, 0x63714c],
    build: addT72,
  },
  {
    id: 'm1-abrams',
    name: 'M1A2 Abrams',
    palette: [0xc4a36f, 0x8f7650, 0xd1b27a],
    build: addAbrams,
  },
  {
    id: 'leopard-2a6',
    name: 'Leopard 2A6',
    palette: [0x6c7355, 0x3d4335, 0x7f8767],
    build: addLeopard,
  },
  {
    id: 'merkava-mk4',
    name: 'Merkava Mk.4',
    palette: [0xa0936c, 0x6d6247, 0xb4a67a],
    build: addMerkava,
  },
];

const makePalette = ([armorColor, darkColor, armor2Color]) => ({
  armor: makeMaterial('main_armor', armorColor),
  dark: makeMaterial('shadow_armor', darkColor),
  armor2: makeMaterial('secondary_armor', armor2Color),
  era: makeMaterial('bolt_on_reactive_armor', 0x77745e, 0.82, 0.08),
  track: makeMaterial('track_rubber', 0x161915, 0.92, 0.04),
  trackMetal: makeMaterial('worn_track_metal', 0x66685e, 0.7, 0.35),
  barrel: makeMaterial('gunmetal', 0x343935, 0.62, 0.42),
  optic: makeMaterial('blue_black_optics', 0x245261, 0.25, 0.08),
});

const exporter = new GLTFExporter();

for (const definition of definitions) {
  const root = new THREE.Group();
  root.name = `${definition.id}_root`;
  definition.build(root, makePalette(definition.palette));
  root.updateMatrixWorld(true);

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

  const outputDir = path.join(tanksRoot, definition.id);
  await fs.mkdir(outputDir, {recursive: true});
  await fs.writeFile(path.join(outputDir, 'scene.gltf'), JSON.stringify(gltf, null, 2));
  await fs.writeFile(
      path.join(outputDir, 'SOURCE.txt'),
      [
        `Model: ${definition.name}`,
        'Author: Groundfire procedural generator',
        'Source: scripts/generate-historical-tanks.mjs',
        'License: project-owned generated geometry',
        '',
      ].join('\n'),
  );
  console.log(`Generated ${path.join(outputDir, 'scene.gltf')}`);
}
