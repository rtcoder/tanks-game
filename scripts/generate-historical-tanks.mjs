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

const addChallenger = (root, mats) => {
  const hull = new THREE.Group();
  hull.name = 'hull';
  root.add(hull);

  hull.add(mesh('heavy_hull_lower', box(43, 68, 9), mats.dark, [0, 0, 6]));
  hull.add(mesh('heavy_hull_upper', box(36, 54, 9), mats.armor, [0, 1, 14]));
  hull.add(mesh('broad_front_glacis', box(34, 16, 5), mats.armor, [0, 30, 17], [0.28, 0, 0]));
  hull.add(mesh('rear_engine_deck', box(34, 16, 4), mats.dark, [0, -29, 18]));
  hull.add(mesh('left_dorchester_skirt', box(6, 66, 13), mats.armor2, [-26, 0, 11]));
  hull.add(mesh('right_dorchester_skirt', box(6, 66, 13), mats.armor2, [26, 0, 11]));

  addTrack(hull, 'left', -23, 68, 9, mats, 6);
  addTrack(hull, 'right', 23, 68, 9, mats, 6);

  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.set(0, 3, 23);
  root.add(turret);
  turret.add(mesh('turret_ring', cyl(12, 13, 3, 36), mats.dark, [0, 0, -1], [Math.PI / 2, 0, 0]));
  turret.add(mesh('massive_turret_core', box(30, 27, 11), mats.armor, [0, 0, 4.5]));
  turret.add(mesh('flat_front_armor_face', box(28, 10, 10), mats.armor2, [0, 13, 4.5]));
  turret.add(mesh('left_turret_slab', box(5, 24, 9), mats.armor2, [-17, 1, 4], [0, 0, -0.18]));
  turret.add(mesh('right_turret_slab', box(5, 24, 9), mats.armor2, [17, 1, 4], [0, 0, 0.18]));
  turret.add(mesh('commander_sight', cyl(3.8, 4.2, 2.4, 24), mats.optic, [-7, -2, 12], [Math.PI / 2, 0, 0]));
  turret.add(mesh('turret_rear_bin', box(31, 12, 6), mats.dark, [0, -19, 6]));

  addBarrel(turret, {origin: [0, 14, 5], length: 45, radius: 1.2, mantlet: [11, 4, 7]}, mats);
};

const addLeclerc = (root, mats) => {
  const hull = new THREE.Group();
  hull.name = 'hull';
  root.add(hull);

  hull.add(mesh('compact_hull_lower', box(37, 62, 8), mats.dark, [0, 0, 6]));
  hull.add(mesh('compact_hull_upper', box(31, 49, 8), mats.armor, [0, 2, 13]));
  hull.add(mesh('sharp_nose_plate', box(30, 15, 5), mats.armor, [0, 29, 16], [0.38, 0, 0]));
  hull.add(mesh('rear_powerpack_deck', box(30, 14, 3), mats.dark, [0, -26, 17]));
  hull.add(mesh('left_light_skirt', box(4.2, 60, 10), mats.armor2, [-23, 0, 10]));
  hull.add(mesh('right_light_skirt', box(4.2, 60, 10), mats.armor2, [23, 0, 10]));

  addTrack(hull, 'left', -21.5, 62, 8.5, mats, 6);
  addTrack(hull, 'right', 21.5, 62, 8.5, mats, 6);

  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.set(0, 6, 21.5);
  root.add(turret);
  turret.add(mesh('turret_ring', cyl(10.5, 11.5, 3, 36), mats.dark, [0, 0, -1], [Math.PI / 2, 0, 0]));
  turret.add(mesh('low_autoloader_turret', box(24, 22, 9), mats.armor, [0, 0, 4]));
  turret.add(mesh('pointed_front_wedge', box(24, 11, 8), mats.armor2, [0, 12, 4], [0, 0, 0]));
  turret.add(mesh('left_turret_angle', box(4, 20, 8), mats.armor2, [-14, 1, 4], [0, 0, -0.28]));
  turret.add(mesh('right_turret_angle', box(4, 20, 8), mats.armor2, [14, 1, 4], [0, 0, 0.28]));
  turret.add(mesh('panoramic_sight', cyl(2.4, 2.7, 2.4, 20), mats.optic, [6, 1, 11], [Math.PI / 2, 0, 0]));
  turret.add(mesh('rear_autoloader_bustle', box(24, 11, 6), mats.dark, [0, -16, 5]));

  addBarrel(turret, {origin: [0, 13, 4.8], length: 43, radius: 1.05, mantlet: [9, 4, 6]}, mats);
};

const addK2 = (root, mats) => {
  const hull = new THREE.Group();
  hull.name = 'hull';
  root.add(hull);

  hull.add(mesh('k2_hull_lower', box(39, 65, 8), mats.dark, [0, 0, 6]));
  hull.add(mesh('k2_hull_upper', box(32, 52, 8), mats.armor, [0, 2, 13]));
  hull.add(mesh('faceted_front_glacis', box(31, 15, 5), mats.armor2, [0, 30, 16], [0.34, 0, 0]));
  hull.add(mesh('rear_deck_grilles', box(30, 16, 3), mats.dark, [0, -28, 17]));
  hull.add(mesh('left_modern_skirt', box(5, 63, 11), mats.armor2, [-24, 0, 10]));
  hull.add(mesh('right_modern_skirt', box(5, 63, 11), mats.armor2, [24, 0, 10]));
  addEraBlocks(hull, 'side_left', 5, -25, 18, 18, 0, [2, 5, 3], mats.era);
  addEraBlocks(hull, 'side_right', 5, 25, 18, 18, 0, [2, 5, 3], mats.era);

  addTrack(hull, 'left', -22, 65, 9, mats, 6);
  addTrack(hull, 'right', 22, 65, 9, mats, 6);

  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.set(0, 6, 22);
  root.add(turret);
  turret.add(mesh('turret_ring', cyl(11, 12, 3, 36), mats.dark, [0, 0, -1], [Math.PI / 2, 0, 0]));
  turret.add(mesh('angular_tech_turret', box(26, 24, 10), mats.armor, [0, 0, 4]));
  turret.add(mesh('arrowhead_front_armor', box(26, 12, 9), mats.armor2, [0, 13, 4], [0, 0, 0]));
  turret.add(mesh('left_cheek_module', box(6, 19, 8), mats.era, [-15, 4, 4], [0, 0, -0.28]));
  turret.add(mesh('right_cheek_module', box(6, 19, 8), mats.era, [15, 4, 4], [0, 0, 0.28]));
  turret.add(mesh('commander_optic_stack', box(5, 5, 5), mats.optic, [-7, 3, 11]));
  turret.add(mesh('active_protection_box', box(4, 4, 3), mats.barrel, [8, -2, 11]));

  addBarrel(turret, {origin: [0, 14, 5], length: 48, radius: 1.08, mantlet: [10, 4, 7]}, mats);
};

const addType10 = (root, mats) => {
  const hull = new THREE.Group();
  hull.name = 'hull';
  root.add(hull);

  hull.add(mesh('light_hull_lower', box(35, 58, 7), mats.dark, [0, 0, 5.5]));
  hull.add(mesh('light_hull_upper', box(29, 46, 7), mats.armor, [0, 2, 12]));
  hull.add(mesh('steep_compact_glacis', box(28, 13, 4.5), mats.armor2, [0, 27, 15], [0.42, 0, 0]));
  hull.add(mesh('compact_rear_deck', box(28, 13, 3), mats.dark, [0, -25, 16]));
  hull.add(mesh('left_slim_skirt', box(4, 56, 9), mats.armor2, [-21.5, 0, 9]));
  hull.add(mesh('right_slim_skirt', box(4, 56, 9), mats.armor2, [21.5, 0, 9]));

  addTrack(hull, 'left', -20.5, 58, 8, mats, 5);
  addTrack(hull, 'right', 20.5, 58, 8, mats, 5);

  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.set(0, 5, 20);
  root.add(turret);
  turret.add(mesh('turret_ring', cyl(10, 11, 3, 36), mats.dark, [0, 0, -1], [Math.PI / 2, 0, 0]));
  turret.add(mesh('compact_faceted_turret', box(23, 21, 8), mats.armor, [0, 0, 3.8]));
  turret.add(mesh('sharp_front_turret', box(22, 10, 7.5), mats.armor2, [0, 11.5, 3.8]));
  turret.add(mesh('left_light_cheek', box(4, 17, 7), mats.armor2, [-13, 2, 4], [0, 0, -0.3]));
  turret.add(mesh('right_light_cheek', box(4, 17, 7), mats.armor2, [13, 2, 4], [0, 0, 0.3]));
  turret.add(mesh('small_panoramic_sight', cyl(2, 2.3, 2.2, 18), mats.optic, [6, 0, 10], [Math.PI / 2, 0, 0]));

  addBarrel(turret, {origin: [0, 12.5, 4.5], length: 39, radius: 1, mantlet: [8, 4, 6]}, mats);
};

const addM60 = (root, mats) => {
  const hull = new THREE.Group();
  hull.name = 'hull';
  root.add(hull);

  hull.add(mesh('patton_hull_lower', box(38, 63, 9), mats.dark, [0, 0, 6]));
  hull.add(mesh('patton_hull_upper', box(31, 50, 8), mats.armor, [0, 2, 14]));
  hull.add(mesh('rounded_front_casting', box(30, 14, 5), mats.armor, [0, 29, 17], [0.25, 0, 0]));
  hull.add(mesh('rear_engine_deck', box(30, 14, 4), mats.dark, [0, -27, 18]));
  hull.add(mesh('left_fender', box(5, 60, 5), mats.armor2, [-23, 0, 14]));
  hull.add(mesh('right_fender', box(5, 60, 5), mats.armor2, [23, 0, 14]));

  addTrack(hull, 'left', -21.5, 63, 9, mats, 6);
  addTrack(hull, 'right', 21.5, 63, 9, mats, 6);

  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.set(0, 4, 23);
  root.add(turret);
  turret.add(mesh('turret_ring', cyl(11, 12, 3, 36), mats.dark, [0, 0, -1], [Math.PI / 2, 0, 0]));
  turret.add(mesh('tall_cast_turret', new THREE.SphereGeometry(13, 32, 16), mats.armor, [0, 0, 5], [0, 0, 0], [1.02, 1, 0.62]));
  turret.add(mesh('turret_front_nose', box(18, 8, 8), mats.armor, [0, 10, 5]));
  turret.add(mesh('large_commander_cupola', cyl(4.3, 4.7, 3.2, 24), mats.dark, [-5, -3, 13], [Math.PI / 2, 0, 0]));
  turret.add(mesh('rangefinder_left', box(3, 5, 3), mats.optic, [-12, 3, 8]));
  turret.add(mesh('rangefinder_right', box(3, 5, 3), mats.optic, [12, 3, 8]));

  addBarrel(turret, {origin: [0, 12, 5.5], length: 40, radius: 1.12, mantlet: [9, 4, 6], muzzle: [5.2, 3, 2.2]}, mats);
};

const add7TP = (root, mats) => {
  const hull = new THREE.Group();
  hull.name = 'hull';
  root.add(hull);

  hull.add(mesh('riveted_hull_lower', box(24, 40, 7), mats.dark, [0, 0, 5]));
  hull.add(mesh('riveted_hull_upper', box(20, 31, 8), mats.armor, [0, 2, 11]));
  hull.add(mesh('front_driver_plate', box(18, 8, 5), mats.armor2, [0, 20, 13], [0.24, 0, 0]));
  hull.add(mesh('rear_engine_box', box(19, 9, 5), mats.dark, [0, -18, 13]));
  hull.add(mesh('left_rivet_strip', box(1.4, 34, 2), mats.trackMetal, [-11.5, 0, 15]));
  hull.add(mesh('right_rivet_strip', box(1.4, 34, 2), mats.trackMetal, [11.5, 0, 15]));

  addTrack(hull, 'left', -15, 42, 7, mats, 4);
  addTrack(hull, 'right', 15, 42, 7, mats, 4);

  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.set(0, 4, 17.5);
  root.add(turret);
  turret.add(mesh('small_turret_ring', cyl(6.8, 7.4, 2.2, 24), mats.dark, [0, 0, -1], [Math.PI / 2, 0, 0]));
  turret.add(mesh('riveted_turret_box', box(13, 12, 8), mats.armor, [0, 0, 3.5]));
  turret.add(mesh('turret_front_plate', box(12, 5, 7), mats.armor2, [0, 6.5, 3.5]));
  turret.add(mesh('commander_hatch', cyl(2.4, 2.7, 1.5, 18), mats.dark, [-3, -2, 8], [Math.PI / 2, 0, 0]));

  addBarrel(turret, {origin: [0, 7, 3.8], length: 21, radius: 0.72, mantlet: [5, 2.6, 4], muzzle: [3.2, 1.8, 1.6]}, mats);
};

const add10TP = (root, mats) => {
  const hull = new THREE.Group();
  hull.name = 'hull';
  root.add(hull);

  hull.add(mesh('christie_hull_lower', box(29, 48, 7), mats.dark, [0, 0, 5]));
  hull.add(mesh('fast_hull_upper', box(23, 38, 7), mats.armor, [0, 3, 11.5]));
  hull.add(mesh('sloped_front_plate', box(22, 10, 4), mats.armor2, [0, 24, 14], [0.36, 0, 0]));
  hull.add(mesh('rear_engine_cover', box(22, 10, 4), mats.dark, [0, -22, 14]));
  hull.add(mesh('left_suspension_cover', box(3, 44, 4), mats.armor2, [-17, 0, 10]));
  hull.add(mesh('right_suspension_cover', box(3, 44, 4), mats.armor2, [17, 0, 10]));

  addTrack(hull, 'left', -16, 49, 7, mats, 4);
  addTrack(hull, 'right', 16, 49, 7, mats, 4);

  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.set(0, 4, 18);
  root.add(turret);
  turret.add(mesh('turret_ring', cyl(7.6, 8.4, 2.4, 28), mats.dark, [0, 0, -1], [Math.PI / 2, 0, 0]));
  turret.add(mesh('prototype_turret_core', box(15, 14, 8), mats.armor, [0, 0, 3.8]));
  turret.add(mesh('rounded_turret_front', box(14, 6, 7), mats.armor2, [0, 7.5, 3.8]));
  turret.add(mesh('cupola', cyl(2.6, 3, 1.8, 18), mats.dark, [-3.8, -2, 8.5], [Math.PI / 2, 0, 0]));

  addBarrel(turret, {origin: [0, 8, 4], length: 24, radius: 0.8, mantlet: [5.5, 2.8, 4.2]}, mats);
};

const addPT91 = (root, mats) => {
  const hull = new THREE.Group();
  hull.name = 'hull';
  root.add(hull);

  hull.add(mesh('twardy_hull_lower', box(38, 62, 8), mats.dark, [0, 0, 5]));
  hull.add(mesh('twardy_hull_upper', box(31, 51, 7), mats.armor, [0, 3, 12]));
  hull.add(mesh('front_glacis', box(30, 13, 4), mats.armor, [0, 29, 15], [0.36, 0, 0]));
  hull.add(mesh('rear_deck', box(29, 14, 3), mats.dark, [0, -27, 15]));
  hull.add(mesh('left_skirt_erawa', box(4.5, 60, 8), mats.armor2, [-23.5, 0, 10]));
  hull.add(mesh('right_skirt_erawa', box(4.5, 60, 8), mats.armor2, [23.5, 0, 10]));
  addEraBlocks(hull, 'front_erawa', 7, -15, 29, 18, 5, [3.7, 2.2, 2.1], mats.era);

  addTrack(hull, 'left', -22, 63, 9, mats, 6);
  addTrack(hull, 'right', 22, 63, 9, mats, 6);

  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.set(0, 4, 20.5);
  root.add(turret);
  turret.add(mesh('turret_ring', cyl(11.2, 12, 3, 36), mats.dark, [0, 0, -1], [Math.PI / 2, 0, 0]));
  turret.add(mesh('twardy_low_turret', new THREE.SphereGeometry(13, 32, 16), mats.armor, [0, 0, 4], [0, 0, 0], [1.1, 0.95, 0.45]));
  turret.add(mesh('front_erawa_plate', box(20, 8, 6), mats.era, [0, 10, 4]));
  addEraBlocks(turret, 'turret_erawa_left', 3, -9, 9.8, 8, 4.5, [3.3, 2.2, 2.2], mats.era);
  addEraBlocks(turret, 'turret_erawa_right', 3, 1, 9.8, 8, 4.5, [3.3, 2.2, 2.2], mats.era);
  turret.add(mesh('drawa_sight_box', box(4, 4, 3), mats.optic, [6.5, 5, 9]));
  turret.add(mesh('commander_cupola', cyl(3.2, 3.8, 2.1, 24), mats.dark, [-5, -3, 9], [Math.PI / 2, 0, 0]));

  addBarrel(turret, {origin: [0, 11, 4.2], length: 38, radius: 1.18, mantlet: [9, 4, 5]}, mats);
};

const addLeopard2PL = (root, mats) => {
  const hull = new THREE.Group();
  hull.name = 'hull';
  root.add(hull);

  hull.add(mesh('leopard2pl_hull_lower', box(39, 70, 8), mats.dark, [0, 0, 6]));
  hull.add(mesh('leopard2pl_hull_upper', box(32, 56, 8), mats.armor, [0, 1, 13]));
  hull.add(mesh('angled_nose', box(31, 17, 5), mats.armor, [0, 31, 16], [0.34, 0, 0]));
  hull.add(mesh('rear_engine_grille', box(30, 16, 3), mats.dark, [0, -30, 17]));
  hull.add(mesh('left_polish_skirt', box(4.8, 68, 12), mats.armor2, [-24, 0, 10]));
  hull.add(mesh('right_polish_skirt', box(4.8, 68, 12), mats.armor2, [24, 0, 10]));

  addTrack(hull, 'left', -22, 70, 9, mats, 7);
  addTrack(hull, 'right', 22, 70, 9, mats, 7);

  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.set(0, 7, 22);
  root.add(turret);
  turret.add(mesh('turret_ring', cyl(11, 12, 3, 36), mats.dark, [0, 0, -1], [Math.PI / 2, 0, 0]));
  turret.add(mesh('turret_core', box(25, 26, 10), mats.armor, [0, 0, 4]));
  turret.add(mesh('polish_modular_front_armor', box(28, 13, 10), mats.era, [0, 13.5, 4]));
  turret.add(mesh('left_side_module', box(5.5, 23, 9), mats.era, [-15.5, 2, 4], [0, 0, -0.2]));
  turret.add(mesh('right_side_module', box(5.5, 23, 9), mats.era, [15.5, 2, 4], [0, 0, 0.2]));
  turret.add(mesh('commander_sight_box', box(5, 5, 4), mats.optic, [-7, 4, 11]));
  turret.add(mesh('thermal_camera_box', box(4.2, 4.2, 3.2), mats.optic, [8, 5, 10.5]));

  addBarrel(turret, {origin: [0, 15, 5], length: 48, radius: 1.08, mantlet: [10, 4, 7]}, mats);
};

const addPL01 = (root, mats) => {
  const hull = new THREE.Group();
  hull.name = 'hull';
  root.add(hull);

  hull.add(mesh('stealth_hull_lower', box(39, 62, 8), mats.dark, [0, 0, 6]));
  hull.add(mesh('faceted_stealth_hull', box(33, 50, 8), mats.armor, [0, 1, 13]));
  hull.add(mesh('stealth_front_wedge', box(32, 15, 5), mats.armor2, [0, 29, 16], [0.42, 0, 0]));
  hull.add(mesh('rear_flat_deck', box(30, 14, 3), mats.dark, [0, -27, 17]));
  hull.add(mesh('left_stealth_skirt', box(5.2, 60, 12), mats.armor2, [-24, 0, 10]));
  hull.add(mesh('right_stealth_skirt', box(5.2, 60, 12), mats.armor2, [24, 0, 10]));

  addTrack(hull, 'left', -22, 62, 9, mats, 6);
  addTrack(hull, 'right', 22, 62, 9, mats, 6);

  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.set(0, 5, 21.5);
  root.add(turret);
  turret.add(mesh('low_turret_ring', cyl(10.5, 11.5, 2.6, 36), mats.dark, [0, 0, -1], [Math.PI / 2, 0, 0]));
  turret.add(mesh('unmanned_stealth_turret', box(24, 22, 8), mats.armor, [0, 0, 3.7]));
  turret.add(mesh('faceted_front_mask', box(25, 10, 8), mats.armor2, [0, 12, 3.8]));
  turret.add(mesh('left_faceted_cheek', box(4.5, 18, 7.5), mats.armor2, [-14, 2, 3.8], [0, 0, -0.35]));
  turret.add(mesh('right_faceted_cheek', box(4.5, 18, 7.5), mats.armor2, [14, 2, 3.8], [0, 0, 0.35]));
  turret.add(mesh('sensor_mast', box(3.4, 3.4, 4.5), mats.optic, [0, -2, 10.5]));

  addBarrel(turret, {origin: [0, 12.5, 4.5], length: 40, radius: 0.95, mantlet: [8, 4, 6]}, mats);
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
  {
    id: 'challenger-2',
    name: 'Challenger 2',
    palette: [0x5c624c, 0x343a30, 0x73785d],
    build: addChallenger,
  },
  {
    id: 'leclerc',
    name: 'Leclerc',
    palette: [0x5f6751, 0x343b30, 0x788068],
    build: addLeclerc,
  },
  {
    id: 'k2-black-panther',
    name: 'K2 Black Panther',
    palette: [0x3f4a39, 0x202820, 0x56634b],
    build: addK2,
  },
  {
    id: 'type-10',
    name: 'Type 10',
    palette: [0x596555, 0x323a32, 0x6f7a67],
    build: addType10,
  },
  {
    id: 'm60-patton',
    name: 'M60 Patton',
    palette: [0x5f6847, 0x38402e, 0x737b55],
    build: addM60,
  },
  {
    id: '7tp',
    name: '7TP',
    palette: [0x4d5f3f, 0x2e3928, 0x667551],
    build: add7TP,
  },
  {
    id: '10tp',
    name: '10TP',
    palette: [0x526346, 0x303a2e, 0x6a7857],
    build: add10TP,
  },
  {
    id: 'pt91-twardy',
    name: 'PT-91 Twardy',
    palette: [0x4d5d3f, 0x2b3327, 0x69734c],
    build: addPT91,
  },
  {
    id: 'leopard-2pl',
    name: 'Leopard 2PL',
    palette: [0x59644e, 0x333c31, 0x707a61],
    build: addLeopard2PL,
  },
  {
    id: 'pl-01',
    name: 'PL-01 Concept',
    palette: [0x4d5450, 0x242927, 0x6b706a],
    build: addPL01,
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
