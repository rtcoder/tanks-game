import * as THREE from 'three';
import {MAP_ASSET_MANIFEST, type GroundfireElementPreset} from '../../shared/map-assets';
import type {GroundfireMap, GroundfireMapElement, GroundfireMapGroup, GroundfireWaterSource} from '../../shared/types';

type EditorTool = 'raise' | 'lower' | 'smooth' | 'flatten' | 'place' | 'select' | 'water';

type EditorElement = {
  mesh: THREE.Mesh;
  data: GroundfireMapElement;
};

type DragState = {
  ids: string[];
  offsets: Map<string, THREE.Vector3>;
};

const HEIGHTMAP_RESOLUTION = 128;
const TERRAIN_SEGMENTS = HEIGHTMAP_RESOLUTION - 1;

export class MapEditor {
  root: HTMLElement;
  viewport: HTMLElement;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(55, 1, 0.5, 10000);
  renderer = new THREE.WebGLRenderer({antialias: true});
  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  terrainGeometry!: THREE.PlaneGeometry;
  terrainMesh!: THREE.Mesh;
  ghostMesh!: THREE.Mesh;
  waterMeshes: THREE.Mesh[] = [];
  elements = new Map<string, EditorElement>();
  groups: GroundfireMapGroup[] = [];
  selectedIds = new Set<string>();
  dragState: DragState | null = null;
  mapIdInput!: HTMLInputElement;
  mapNameInput!: HTMLInputElement;
  mapSizeInput!: HTMLInputElement;
  toolInput!: HTMLSelectElement;
  brushSizeInput!: HTMLInputElement;
  brushStrengthInput!: HTMLInputElement;
  flattenHeightInput!: HTMLInputElement;
  presetInput!: HTMLSelectElement;
  destructibleInput!: HTMLInputElement;
  healthInput!: HTMLInputElement;
  waterLevelInput!: HTMLInputElement;
  statusElement!: HTMLElement;
  terrainSize = 1500;
  tool: EditorTool = 'raise';
  brushSize = 110;
  brushStrength = 18;
  ghostRotation = 0;
  waterSources: GroundfireWaterSource[] = [];
  isPainting = false;
  cameraYaw = -Math.PI / 4;
  cameraPitch = 0.92;
  cameraDistance = 1750;
  cameraTarget = new THREE.Vector3();
  isOrbiting = false;
  lastPointer = new THREE.Vector2();

  constructor() {
    document.body.classList.add('editor-page');
    document.body.innerHTML = this.template();
    this.root = document.getElementById('editor-root') as HTMLElement;
    this.viewport = document.getElementById('editor-viewport') as HTMLElement;
    this.bindControls();
    this.setupScene();
    this.createTerrain();
    this.createGhost();
    this.bindEvents();
    this.resize();
    this.animate();
    this.setStatus('Editor ready');
  }

  template(): string {
    const presetOptions = MAP_ASSET_MANIFEST.elementPresets.map((preset) => (
      `<option value="${preset.key}">${preset.label}</option>`
    )).join('');

    return `
      <main class="editor" id="editor-root">
        <section class="editor__viewport" id="editor-viewport"></section>
        <aside class="editor__panel">
          <div class="editor__brand">
            <span>Groundfire</span>
            <strong>Map Editor</strong>
          </div>
          <label>Map id<input id="editor-map-id" value="custom-map"></label>
          <label>Name<input id="editor-map-name" value="Custom Map"></label>
          <label>Size<input id="editor-map-size" type="number" min="400" max="10000" step="100" value="1500"></label>
          <div class="editor__row">
            <button id="editor-apply-size" type="button">Apply size</button>
            <button id="editor-reset-terrain" type="button">Flat terrain</button>
          </div>
          <label>Tool
            <select id="editor-tool">
              <option value="raise">Raise</option>
              <option value="lower">Lower</option>
              <option value="smooth">Smooth</option>
              <option value="flatten">Flatten</option>
              <option value="place">Place object</option>
              <option value="select">Select / move</option>
              <option value="water">Pour water</option>
            </select>
          </label>
          <label>Brush size<input id="editor-brush-size" type="range" min="20" max="420" value="110"></label>
          <label>Brush strength<input id="editor-brush-strength" type="range" min="1" max="80" value="18"></label>
          <label>Flatten height<input id="editor-flatten-height" type="number" step="5" value="0"></label>
          <label>Object
            <select id="editor-preset">${presetOptions}</select>
          </label>
          <label class="editor__check"><input id="editor-destructible" type="checkbox" checked> Destructible</label>
          <label>Health<input id="editor-health" type="number" min="1" max="9999" value="20"></label>
          <label>Water level<input id="editor-water-level" type="number" step="5" value="0"></label>
          <div class="editor__row">
            <button id="editor-rotate-left" type="button">Rotate -90</button>
            <button id="editor-rotate-right" type="button">Rotate +90</button>
          </div>
          <div class="editor__row">
            <button id="editor-group" type="button">Group</button>
            <button id="editor-delete" type="button">Delete</button>
          </div>
          <div class="editor__row">
            <button id="editor-export-json" type="button">Export JSON</button>
            <button id="editor-export-heightmap" type="button">Export heightmap</button>
          </div>
          <p class="editor__status" id="editor-status">Loading</p>
        </aside>
      </main>
    `;
  }

  bindControls(): void {
    this.mapIdInput = document.getElementById('editor-map-id') as HTMLInputElement;
    this.mapNameInput = document.getElementById('editor-map-name') as HTMLInputElement;
    this.mapSizeInput = document.getElementById('editor-map-size') as HTMLInputElement;
    this.toolInput = document.getElementById('editor-tool') as HTMLSelectElement;
    this.brushSizeInput = document.getElementById('editor-brush-size') as HTMLInputElement;
    this.brushStrengthInput = document.getElementById('editor-brush-strength') as HTMLInputElement;
    this.flattenHeightInput = document.getElementById('editor-flatten-height') as HTMLInputElement;
    this.presetInput = document.getElementById('editor-preset') as HTMLSelectElement;
    this.destructibleInput = document.getElementById('editor-destructible') as HTMLInputElement;
    this.healthInput = document.getElementById('editor-health') as HTMLInputElement;
    this.waterLevelInput = document.getElementById('editor-water-level') as HTMLInputElement;
    this.statusElement = document.getElementById('editor-status') as HTMLElement;
  }

  setupScene(): void {
    this.scene.background = new THREE.Color(0x8fb5d6);
    this.scene.fog = new THREE.Fog(0x8fb5d6, 1800, 5200);
    this.camera.up.set(0, 1, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.viewport.appendChild(this.renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x334026, 2.4);
    const sun = new THREE.DirectionalLight(0xfff1d0, 3.8);
    sun.position.set(600, 900, 500);
    sun.castShadow = true;
    this.scene.add(hemi, sun);
    this.updateCamera();
  }

  createTerrain(): void {
    if (this.terrainMesh) {
      this.scene.remove(this.terrainMesh);
      this.terrainGeometry.dispose();
    }

    this.terrainGeometry = new THREE.PlaneGeometry(this.terrainSize, this.terrainSize, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
    this.terrainGeometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshStandardMaterial({
      color: 0x788842,
      roughness: 0.92,
      metalness: 0,
    });
    this.terrainMesh = new THREE.Mesh(this.terrainGeometry, material);
    this.terrainMesh.name = 'terrain';
    this.terrainMesh.receiveShadow = true;
    this.scene.add(this.terrainMesh);
  }

  createGhost(): void {
    const preset = this.currentPreset();
    this.ghostMesh = this.createElementMesh(preset, true);
    this.ghostMesh.visible = false;
    this.scene.add(this.ghostMesh);
  }

  bindEvents(): void {
    window.addEventListener('resize', () => this.resize());
    this.toolInput.addEventListener('change', () => {
      this.tool = this.toolInput.value as EditorTool;
      this.ghostMesh.visible = this.tool === 'place';
    });
    this.brushSizeInput.addEventListener('input', () => {
      this.brushSize = Number(this.brushSizeInput.value);
    });
    this.brushStrengthInput.addEventListener('input', () => {
      this.brushStrength = Number(this.brushStrengthInput.value);
    });
    this.presetInput.addEventListener('change', () => this.refreshGhost());
    document.getElementById('editor-apply-size')?.addEventListener('click', () => this.applyTerrainSize());
    document.getElementById('editor-reset-terrain')?.addEventListener('click', () => this.resetTerrain());
    document.getElementById('editor-rotate-left')?.addEventListener('click', () => this.rotateSelection(-Math.PI / 2));
    document.getElementById('editor-rotate-right')?.addEventListener('click', () => this.rotateSelection(Math.PI / 2));
    document.getElementById('editor-group')?.addEventListener('click', () => this.groupSelection());
    document.getElementById('editor-delete')?.addEventListener('click', () => this.deleteSelection());
    document.getElementById('editor-export-json')?.addEventListener('click', () => this.exportJson());
    document.getElementById('editor-export-heightmap')?.addEventListener('click', () => this.exportHeightmap());

    this.renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());
    this.renderer.domElement.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    this.renderer.domElement.addEventListener('pointermove', (event) => this.onPointerMove(event));
    window.addEventListener('pointerup', () => {
      this.isPainting = false;
      this.isOrbiting = false;
      this.dragState = null;
    });
    this.renderer.domElement.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.cameraDistance = THREE.MathUtils.clamp(this.cameraDistance + event.deltaY * 1.2, 280, 5600);
      this.updateCamera();
    }, {passive: false});
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        this.deleteSelection();
      }
    });
  }

  onPointerDown(event: PointerEvent): void {
    this.updatePointer(event);
    this.lastPointer.set(event.clientX, event.clientY);

    if (event.button === 2) {
      this.isOrbiting = true;
      return;
    }

    if (this.tool === 'place') {
      this.placeObject();
      return;
    }

    if (this.tool === 'water') {
      this.addWaterSource();
      return;
    }

    if (this.tool === 'select') {
      this.handleSelection(event.shiftKey);
      return;
    }

    this.isPainting = true;
    this.paintAtPointer();
  }

  onPointerMove(event: PointerEvent): void {
    this.updatePointer(event);
    if (this.isOrbiting) {
      const dx = event.clientX - this.lastPointer.x;
      const dy = event.clientY - this.lastPointer.y;
      this.cameraYaw -= dx * 0.006;
      this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch + dy * 0.004, 0.32, 1.38);
      this.lastPointer.set(event.clientX, event.clientY);
      this.updateCamera();
      return;
    }

    if (this.dragState) {
      this.dragSelection();
      return;
    }

    if (this.tool === 'place') {
      this.updateGhost();
      return;
    }

    if (this.isPainting) {
      this.paintAtPointer();
    }
  }

  updatePointer(event: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  paintAtPointer(): void {
    const hit = this.intersectTerrain();
    if (!hit) {
      return;
    }

    this.applyBrush(hit.point.x, hit.point.z);
  }

  applyBrush(centerX: number, centerZ: number): void {
    const positions = this.terrainGeometry.attributes.position;
    const flattenHeight = Number(this.flattenHeightInput.value) || 0;
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const z = positions.getZ(index);
      const distance = Math.hypot(x - centerX, z - centerZ);
      if (distance > this.brushSize) {
        continue;
      }

      const falloff = Math.cos((distance / this.brushSize) * Math.PI * 0.5);
      const currentHeight = positions.getY(index);
      let nextHeight = currentHeight;
      if (this.tool === 'raise') {
        nextHeight += this.brushStrength * falloff * 0.045;
      } else if (this.tool === 'lower') {
        nextHeight -= this.brushStrength * falloff * 0.045;
      } else if (this.tool === 'flatten') {
        nextHeight = THREE.MathUtils.lerp(currentHeight, flattenHeight, falloff * 0.12);
      } else if (this.tool === 'smooth') {
        nextHeight = THREE.MathUtils.lerp(currentHeight, this.averageNeighborHeight(index), falloff * 0.18);
      }
      positions.setY(index, nextHeight);
    }

    positions.needsUpdate = true;
    this.terrainGeometry.computeVertexNormals();
  }

  averageNeighborHeight(index: number): number {
    const positions = this.terrainGeometry.attributes.position;
    const side = HEIGHTMAP_RESOLUTION;
    const x = index % side;
    const y = Math.floor(index / side);
    let total = 0;
    let count = 0;
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx < 0 || nx >= side || ny < 0 || ny >= side) {
          continue;
        }
        total += positions.getY(ny * side + nx);
        count += 1;
      }
    }
    return count > 0 ? total / count : positions.getY(index);
  }

  updateGhost(): void {
    const hit = this.intersectPlacement();
    if (!hit) {
      this.ghostMesh.visible = false;
      return;
    }

    const preset = this.currentPreset();
    const height = preset.size[2];
    this.ghostMesh.visible = true;
    this.ghostMesh.position.set(hit.point.x, this.topSurfaceFromHit(hit) + height / 2, hit.point.z);
    this.ghostMesh.rotation.y = this.ghostRotation;
  }

  placeObject(): void {
    this.updateGhost();
    if (!this.ghostMesh.visible) {
      return;
    }

    const preset = this.currentPreset();
    const id = `${preset.key}-${crypto.randomUUID().slice(0, 8)}`;
    const mesh = this.createElementMesh(preset, false);
    mesh.position.copy(this.ghostMesh.position);
    mesh.rotation.y = this.ghostMesh.rotation.y;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.elementId = id;

    const data: GroundfireMapElement = {
      id,
      type: preset.type,
      position: [mesh.position.x, mesh.position.z, mesh.position.y - preset.size[2] / 2],
      rotation: [0, 0, mesh.rotation.y],
      size: [preset.size[0], preset.size[1], preset.size[2]],
      stacking: {enabled: true, baseElementId: this.baseElementIdUnderGhost()},
      destructible: {
        enabled: this.destructibleInput.checked,
        health: Number(this.healthInput.value) || preset.destructible.health,
      },
      material: preset.material,
      role: preset.type === 'building' ? 'building' : 'maze',
    };
    this.elements.set(id, {mesh, data});
    this.scene.add(mesh);
    this.selectOnly(id);
    this.setStatus(`Placed ${preset.label}`);
  }

  createElementMesh(preset: GroundfireElementPreset, ghost: boolean): THREE.Mesh {
    const material = new THREE.MeshStandardMaterial({
      color: ghost ? 0xd7ff58 : this.materialColor(preset.material),
      transparent: ghost,
      opacity: ghost ? 0.38 : 1,
      roughness: 0.86,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(preset.size[0], preset.size[2], preset.size[1]), material);
    return mesh;
  }

  materialColor(materialKey: string): THREE.ColorRepresentation {
    return MAP_ASSET_MANIFEST.materials.find((material) => material.key === materialKey)?.color ?? '#8a8062';
  }

  baseElementIdUnderGhost(): string | null {
    const hit = this.intersectPlacement();
    const elementId = hit?.object.userData.elementId;
    return typeof elementId === 'string' ? elementId : null;
  }

  topSurfaceFromHit(hit: THREE.Intersection): number {
    const elementId = hit.object.userData.elementId;
    if (typeof elementId === 'string') {
      const element = this.elements.get(elementId);
      if (element) {
        const box = new THREE.Box3().setFromObject(element.mesh);
        return box.max.y;
      }
    }

    return hit.point.y;
  }

  handleSelection(append: boolean): void {
    const hit = this.intersectObjects();
    const id = typeof hit?.object.userData.elementId === 'string' ? hit.object.userData.elementId : null;
    if (!id) {
      if (!append) {
        this.clearSelection();
      }
      return;
    }

    if (append) {
      if (this.selectedIds.has(id)) {
        this.selectedIds.delete(id);
      } else {
        this.selectedIds.add(id);
      }
    } else {
      this.selectOnly(id);
    }

    this.syncSelectionMaterials();
    const terrainHit = this.intersectTerrain();
    if (terrainHit) {
      this.dragState = this.createDragState(terrainHit.point);
    }
  }

  createDragState(anchor: THREE.Vector3): DragState {
    const ids = this.selectedGroupIds();
    const offsets = new Map<string, THREE.Vector3>();
    ids.forEach((id) => {
      const element = this.elements.get(id);
      if (element) {
        offsets.set(id, element.mesh.position.clone().sub(anchor));
      }
    });
    return {ids, offsets};
  }

  dragSelection(): void {
    const hit = this.intersectTerrain();
    if (!hit || !this.dragState) {
      return;
    }

    this.dragState.ids.forEach((id) => {
      const element = this.elements.get(id);
      const offset = this.dragState?.offsets.get(id);
      if (!element || !offset) {
        return;
      }

      element.mesh.position.set(hit.point.x + offset.x, hit.point.y + offset.y, hit.point.z + offset.z);
      this.writeElementFromMesh(element);
    });
  }

  selectedGroupIds(): string[] {
    const selected = Array.from(this.selectedIds);
    const group = this.groups.find((item) => selected.some((id) => item.elementIds.includes(id)));
    return group ? group.elementIds.filter((id) => this.elements.has(id)) : selected;
  }

  rotateSelection(delta: number): void {
    if (this.tool === 'place' || this.selectedIds.size === 0) {
      this.ghostRotation += delta;
      this.updateGhost();
      return;
    }

    this.selectedGroupIds().forEach((id) => {
      const element = this.elements.get(id);
      if (!element) {
        return;
      }
      element.mesh.rotation.y += delta;
      this.writeElementFromMesh(element);
    });
  }

  groupSelection(): void {
    const ids = Array.from(this.selectedIds);
    if (ids.length < 2) {
      this.setStatus('Select at least two objects');
      return;
    }

    const group: GroundfireMapGroup = {
      id: `group-${crypto.randomUUID().slice(0, 8)}`,
      name: `Group ${this.groups.length + 1}`,
      elementIds: ids,
    };
    this.groups.push(group);
    this.setStatus(`Grouped ${ids.length} objects`);
  }

  deleteSelection(): void {
    this.selectedGroupIds().forEach((id) => {
      const element = this.elements.get(id);
      if (!element) {
        return;
      }
      this.scene.remove(element.mesh);
      element.mesh.geometry.dispose();
      if (Array.isArray(element.mesh.material)) {
        element.mesh.material.forEach((material) => material.dispose());
      } else {
        element.mesh.material.dispose();
      }
      this.elements.delete(id);
    });
    this.groups = this.groups
      .map((group) => ({...group, elementIds: group.elementIds.filter((id) => this.elements.has(id))}))
      .filter((group) => group.elementIds.length > 1);
    this.clearSelection();
  }

  addWaterSource(): void {
    const hit = this.intersectTerrain();
    if (!hit) {
      return;
    }

    const waterSource: GroundfireWaterSource = {
      id: `water-${crypto.randomUUID().slice(0, 8)}`,
      seedPoint: [hit.point.x, hit.point.z],
      waterLevel: Number(this.waterLevelInput.value) || hit.point.y,
      material: 'water-clear',
    };
    this.waterSources.push(waterSource);
    this.refreshWaterPreview();
    this.setStatus('Water source added');
  }

  refreshWaterPreview(): void {
    this.waterMeshes.forEach((mesh) => {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((material) => material.dispose());
      } else {
        mesh.material.dispose();
      }
    });
    this.waterMeshes = [];
    this.waterSources.forEach((waterSource) => {
      const mesh = this.createWaterPreviewMesh(waterSource);
      if (mesh) {
        this.waterMeshes.push(mesh);
        this.scene.add(mesh);
      }
    });
  }

  createWaterPreviewMesh(waterSource: GroundfireWaterSource): THREE.Mesh | null {
    const gridSize = 80;
    const cellSize = this.terrainSize / gridSize;
    const seedColumn = Math.floor((waterSource.seedPoint[0] + this.terrainSize / 2) / cellSize);
    const seedRow = Math.floor((waterSource.seedPoint[1] + this.terrainSize / 2) / cellSize);
    if (seedColumn < 0 || seedColumn >= gridSize || seedRow < 0 || seedRow >= gridSize) {
      return null;
    }

    const indexFor = (column: number, row: number): number => row * gridSize + column;
    const centerFor = (column: number, row: number): { x: number; z: number } => ({
      x: -this.terrainSize / 2 + (column + 0.5) * cellSize,
      z: -this.terrainSize / 2 + (row + 0.5) * cellSize,
    });
    const canFill = (column: number, row: number): boolean => {
      const center = centerFor(column, row);
      return this.heightAt(center.x, center.z) <= waterSource.waterLevel;
    };
    if (!canFill(seedColumn, seedRow)) {
      return null;
    }

    const visited = new Set<number>([indexFor(seedColumn, seedRow)]);
    const queue = [{column: seedColumn, row: seedRow}];
    for (let index = 0; index < queue.length; index += 1) {
      const {column, row} = queue[index];
      [
        {column: column + 1, row},
        {column: column - 1, row},
        {column, row: row + 1},
        {column, row: row - 1},
      ].forEach((next) => {
        if (next.column < 0 || next.column >= gridSize || next.row < 0 || next.row >= gridSize) {
          return;
        }
        const nextIndex = indexFor(next.column, next.row);
        if (visited.has(nextIndex) || !canFill(next.column, next.row)) {
          return;
        }
        visited.add(nextIndex);
        queue.push(next);
      });
    }

    const vertices: number[] = [];
    visited.forEach((cellIndex) => {
      const column = cellIndex % gridSize;
      const row = Math.floor(cellIndex / gridSize);
      const minX = -this.terrainSize / 2 + column * cellSize;
      const maxX = minX + cellSize;
      const minZ = -this.terrainSize / 2 + row * cellSize;
      const maxZ = minZ + cellSize;
      const y = waterSource.waterLevel + 0.7;
      vertices.push(
          minX, y, minZ,
          maxX, y, minZ,
          maxX, y, maxZ,
          minX, y, minZ,
          maxX, y, maxZ,
          minX, y, maxZ,
      );
    });
    if (vertices.length === 0) {
      return null;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const material = new THREE.MeshStandardMaterial({
      color: 0x35a9c6,
      transparent: true,
      opacity: 0.52,
      side: THREE.DoubleSide,
      roughness: 0.2,
    });
    return new THREE.Mesh(geometry, material);
  }

  currentPreset(): GroundfireElementPreset {
    return MAP_ASSET_MANIFEST.elementPresets.find((preset) => preset.key === this.presetInput.value)
      ?? MAP_ASSET_MANIFEST.elementPresets[0];
  }

  refreshGhost(): void {
    this.scene.remove(this.ghostMesh);
    this.ghostMesh.geometry.dispose();
    if (Array.isArray(this.ghostMesh.material)) {
      this.ghostMesh.material.forEach((material) => material.dispose());
    } else {
      this.ghostMesh.material.dispose();
    }
    this.createGhost();
  }

  applyTerrainSize(): void {
    this.terrainSize = THREE.MathUtils.clamp(Number(this.mapSizeInput.value) || 1500, 400, 10000);
    this.createTerrain();
    this.elements.forEach((element) => this.scene.add(element.mesh));
    this.refreshWaterPreview();
    this.updateCamera();
  }

  resetTerrain(): void {
    const positions = this.terrainGeometry.attributes.position;
    for (let index = 0; index < positions.count; index += 1) {
      positions.setY(index, 0);
    }
    positions.needsUpdate = true;
    this.terrainGeometry.computeVertexNormals();
    this.refreshWaterPreview();
  }

  heightAt(x: number, z: number): number {
    const positions = this.terrainGeometry.attributes.position;
    const step = this.terrainSize / TERRAIN_SEGMENTS;
    const gridX = THREE.MathUtils.clamp((x + this.terrainSize / 2) / step, 0, TERRAIN_SEGMENTS);
    const gridZ = THREE.MathUtils.clamp((z + this.terrainSize / 2) / step, 0, TERRAIN_SEGMENTS);
    const x0 = Math.floor(gridX);
    const z0 = Math.floor(gridZ);
    const x1 = Math.min(TERRAIN_SEGMENTS, x0 + 1);
    const z1 = Math.min(TERRAIN_SEGMENTS, z0 + 1);
    const tx = gridX - x0;
    const tz = gridZ - z0;
    const side = HEIGHTMAP_RESOLUTION;
    const h00 = positions.getY(z0 * side + x0);
    const h10 = positions.getY(z0 * side + x1);
    const h01 = positions.getY(z1 * side + x0);
    const h11 = positions.getY(z1 * side + x1);
    return THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(h00, h10, tx),
        THREE.MathUtils.lerp(h01, h11, tx),
        tz,
    );
  }

  intersectTerrain(): THREE.Intersection | null {
    const [hit] = this.raycaster.intersectObject(this.terrainMesh, false);
    return hit ?? null;
  }

  intersectObjects(): THREE.Intersection | null {
    const meshes = Array.from(this.elements.values()).map((element) => element.mesh);
    const [hit] = this.raycaster.intersectObjects(meshes, false);
    return hit ?? null;
  }

  intersectPlacement(): THREE.Intersection | null {
    const meshes = [
      ...Array.from(this.elements.values()).map((element) => element.mesh),
      this.terrainMesh,
    ];
    const [hit] = this.raycaster.intersectObjects(meshes, false);
    return hit ?? null;
  }

  selectOnly(id: string): void {
    this.selectedIds = new Set([id]);
    this.syncSelectionMaterials();
  }

  clearSelection(): void {
    this.selectedIds.clear();
    this.syncSelectionMaterials();
  }

  syncSelectionMaterials(): void {
    this.elements.forEach((element, id) => {
      const selected = this.selectedIds.has(id);
      const material = element.mesh.material;
      if (Array.isArray(material)) {
        return;
      }
      if (material instanceof THREE.MeshStandardMaterial) {
        material.emissive = new THREE.Color(selected ? 0x385000 : 0x000000);
        material.emissiveIntensity = selected ? 0.6 : 0;
      }
    });
  }

  writeElementFromMesh(element: EditorElement): void {
    element.data.position = [
      element.mesh.position.x,
      element.mesh.position.z,
      element.mesh.position.y - element.data.size[2] / 2,
    ];
    element.data.rotation = [0, 0, element.mesh.rotation.y];
  }

  exportJson(): void {
    const heightStats = this.heightStats();
    const id = this.safeMapId();
    const map: GroundfireMap = {
      version: 2,
      id,
      name: this.mapNameInput.value.trim() || id,
      arena: {size: this.terrainSize},
      terrain: {
        resolution: HEIGHTMAP_RESOLUTION,
        heightmapAsset: `/api/maps/${id}/assets/heightmap.png`,
        heightScale: Math.max(1, heightStats.max - heightStats.min),
        heightOffset: heightStats.min,
        material: {
          type: 'texture-set',
          textureSet: 'grassy-meadow',
        },
        features: [],
      },
      materials: {
        terrain: 'grassy-meadow',
        wall: 'brick-wall',
        building: 'concrete-building',
        obstacle: 'steel-obstacle',
        water: 'water-clear',
      },
      elements: Array.from(this.elements.values()).map((element) => element.data),
      groups: this.groups,
      water: this.waterSources,
      spawns: this.defaultSpawns(),
    };
    this.downloadBlob(`${id}.json`, JSON.stringify(map, null, 2), 'application/json');
  }

  exportHeightmap(): void {
    const canvas = this.heightmapCanvas();
    canvas.toBlob((blob) => {
      if (!blob) {
        return;
      }
      this.downloadBlob('heightmap.png', blob, 'image/png');
    }, 'image/png');
  }

  heightmapCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = HEIGHTMAP_RESOLUTION;
    canvas.height = HEIGHTMAP_RESOLUTION;
    const context = canvas.getContext('2d');
    if (!context) {
      return canvas;
    }
    const stats = this.heightStats();
    const range = Math.max(1, stats.max - stats.min);
    const imageData = context.createImageData(HEIGHTMAP_RESOLUTION, HEIGHTMAP_RESOLUTION);
    const positions = this.terrainGeometry.attributes.position;
    for (let row = 0; row < HEIGHTMAP_RESOLUTION; row += 1) {
      for (let column = 0; column < HEIGHTMAP_RESOLUTION; column += 1) {
        const sourceIndex = row * HEIGHTMAP_RESOLUTION + column;
        const pixelIndex = sourceIndex * 4;
        const value = Math.round(((positions.getY(sourceIndex) - stats.min) / range) * 255);
        imageData.data[pixelIndex] = value;
        imageData.data[pixelIndex + 1] = value;
        imageData.data[pixelIndex + 2] = value;
        imageData.data[pixelIndex + 3] = 255;
      }
    }
    context.putImageData(imageData, 0, 0);
    return canvas;
  }

  heightStats(): { min: number; max: number } {
    const positions = this.terrainGeometry.attributes.position;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < positions.count; index += 1) {
      const height = positions.getY(index);
      min = Math.min(min, height);
      max = Math.max(max, height);
    }
    return {min: Number.isFinite(min) ? min : 0, max: Number.isFinite(max) ? max : 1};
  }

  defaultSpawns(): GroundfireMap['spawns'] {
    const offset = this.terrainSize * 0.35;
    return [
      {id: 'spawn-1', position: [-offset, -offset, 0], rotation: 0},
      {id: 'spawn-2', position: [offset, offset, 0], rotation: Math.PI},
      {id: 'spawn-3', position: [-offset, offset, 0], rotation: -Math.PI / 2},
      {id: 'spawn-4', position: [offset, -offset, 0], rotation: Math.PI / 2},
    ];
  }

  safeMapId(): string {
    return (this.mapIdInput.value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || 'custom-map').slice(0, 64);
  }

  downloadBlob(name: string, content: BlobPart, type: string): void {
    const blob = content instanceof Blob ? content : new Blob([content], {type});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
    this.setStatus(`Exported ${name}`);
  }

  resize(): void {
    const rect = this.viewport.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  updateCamera(): void {
    const horizontalDistance = Math.cos(this.cameraPitch) * this.cameraDistance;
    this.camera.position.set(
        this.cameraTarget.x + Math.cos(this.cameraYaw) * horizontalDistance,
        this.cameraTarget.y + Math.sin(this.cameraPitch) * this.cameraDistance,
        this.cameraTarget.z + Math.sin(this.cameraYaw) * horizontalDistance,
    );
    this.camera.lookAt(this.cameraTarget);
  }

  animate(): void {
    this.renderer.setAnimationLoop(() => {
      this.renderer.render(this.scene, this.camera);
    });
  }

  setStatus(message: string): void {
    this.statusElement.textContent = message;
  }
}
