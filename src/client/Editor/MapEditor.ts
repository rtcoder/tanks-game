import * as THREE from 'three';
import {MAP_ASSET_MANIFEST, type GroundfireElementPreset} from '../../shared/map-assets';
import {normalizeGroundfireMap} from '../../shared/map-normalizer';
import {createStoredZip, readStoredZipEntries} from '../../shared/zip';
import type {
  GroundfireMap,
  GroundfireMapElement,
  GroundfireMapGroup,
  GroundfireTerrainFeature,
  GroundfireWaterSource,
} from '../../shared/types';

type EditorTool = 'raise' | 'lower' | 'smooth' | 'flatten' | 'place' | 'select' | 'water';

type EditorElement = {
  mesh: THREE.Mesh;
  data: GroundfireMapElement;
};

type DragState = {
  ids: string[];
  offsets: Map<string, THREE.Vector3>;
};

type PlacementSample = {
  point: THREE.Vector3;
  baseElementId: string | null;
};

const HEIGHTMAP_RESOLUTION = 128;
const TERRAIN_SEGMENTS = HEIGHTMAP_RESOLUTION - 1;
const EDITOR_GRID_SIZE = 10;

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
  terrainMaterial!: THREE.MeshStandardMaterial;
  gridHelper: THREE.GridHelper | null = null;
  ghostMesh!: THREE.Mesh;
  waterMeshes: THREE.Mesh[] = [];
  elements = new Map<string, EditorElement>();
  groups: GroundfireMapGroup[] = [];
  selectedIds = new Set<string>();
  selectedWaterId: string | null = null;
  dragState: DragState | null = null;
  lastPlacement: PlacementSample | null = null;
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
  waterTypeInput!: HTMLSelectElement;
  waterFlowRateInput!: HTMLInputElement;
  waterMaxVolumeInput!: HTMLInputElement;
  waterBlocksMovementInput!: HTMLInputElement;
  waterSpeedMultiplierInput!: HTMLInputElement;
  waterDepthBlockThresholdInput!: HTMLInputElement;
  waterProjectileImpactInput!: HTMLSelectElement;
  waterExplosionMultiplierInput!: HTMLInputElement;
  importPackageInput!: HTMLInputElement;
  heatmapInput!: HTMLInputElement;
  waterListElement!: HTMLElement;
  statusElement!: HTMLElement;
  terrainSize = 1500;
  tool: EditorTool = 'raise';
  brushSize = 110;
  brushStrength = 18;
  heatmapEnabled = false;
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
    this.renderWaterList();
    this.setStatus(`Editor ready - grid ${EDITOR_GRID_SIZE}`);
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
          <label>Name<input id="editor-map-name" value="Custom Map"></label>
          <label>Size<input id="editor-map-size" type="number" min="400" max="10000" step="100" value="1500"></label>
          <div class="editor__row">
            <button id="editor-apply-size" type="button">Apply size</button>
            <button id="editor-reset-terrain" type="button">Flat terrain</button>
          </div>
          <section class="editor__section">
            <div class="editor__section-title">Import</div>
            <input class="editor__file-input" id="editor-import-package-input" type="file" accept=".zip,application/zip,application/x-zip-compressed">
            <div class="editor__row">
              <button id="editor-import-package" type="button">Load package</button>
            </div>
            <label class="editor__check"><input id="editor-heatmap" type="checkbox"> Heatmap view</label>
          </section>
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
          <section class="editor__section">
            <div class="editor__section-title">Water lvl 2</div>
            <label>Water type
              <select id="editor-water-type">
                <option value="basin">Basin</option>
                <option value="source">Source</option>
                <option value="drain">Drain</option>
              </select>
            </label>
            <div class="editor__row">
              <label>Flow<input id="editor-water-flow-rate" type="number" min="0" step="0.1" value="0"></label>
              <label>Max volume<input id="editor-water-max-volume" type="number" min="0" step="10" value="0"></label>
            </div>
            <label class="editor__check"><input id="editor-water-blocks" type="checkbox"> Blocks movement</label>
            <div class="editor__row">
              <label>Speed mult<input id="editor-water-speed" type="number" min="0.05" max="1" step="0.05" value="0.45"></label>
              <label>Block depth<input id="editor-water-block-depth" type="number" min="0" step="1" value="28"></label>
            </div>
            <div class="editor__row">
              <label>Projectile
                <select id="editor-water-projectile">
                  <option value="splash">Splash</option>
                  <option value="pass-through">Pass through</option>
                  <option value="none">None</option>
                </select>
              </label>
              <label>Explosion mult<input id="editor-water-explosion" type="number" min="0" max="1" step="0.05" value="0.35"></label>
            </div>
          </section>
          <section class="editor__section">
            <div class="editor__section-title">Water sources</div>
            <div class="editor__water-list" id="editor-water-list"></div>
          </section>
          <div class="editor__row">
            <button id="editor-rotate-left" type="button">Rotate -90</button>
            <button id="editor-rotate-right" type="button">Rotate +90</button>
          </div>
          <div class="editor__row">
            <button id="editor-group" type="button">Group</button>
            <button id="editor-delete" type="button">Delete</button>
          </div>
          <div class="editor__row">
            <button id="editor-export-package" type="button">Export package</button>
          </div>
          <p class="editor__status" id="editor-status">Loading</p>
        </aside>
      </main>
    `;
  }

  bindControls(): void {
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
    this.waterTypeInput = document.getElementById('editor-water-type') as HTMLSelectElement;
    this.waterFlowRateInput = document.getElementById('editor-water-flow-rate') as HTMLInputElement;
    this.waterMaxVolumeInput = document.getElementById('editor-water-max-volume') as HTMLInputElement;
    this.waterBlocksMovementInput = document.getElementById('editor-water-blocks') as HTMLInputElement;
    this.waterSpeedMultiplierInput = document.getElementById('editor-water-speed') as HTMLInputElement;
    this.waterDepthBlockThresholdInput = document.getElementById('editor-water-block-depth') as HTMLInputElement;
    this.waterProjectileImpactInput = document.getElementById('editor-water-projectile') as HTMLSelectElement;
    this.waterExplosionMultiplierInput = document.getElementById('editor-water-explosion') as HTMLInputElement;
    this.importPackageInput = document.getElementById('editor-import-package-input') as HTMLInputElement;
    this.heatmapInput = document.getElementById('editor-heatmap') as HTMLInputElement;
    this.waterListElement = document.getElementById('editor-water-list') as HTMLElement;
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
      this.terrainMaterial.dispose();
    }

    this.terrainGeometry = new THREE.PlaneGeometry(this.terrainSize, this.terrainSize, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
    this.terrainGeometry.rotateX(-Math.PI / 2);
    this.terrainMaterial = new THREE.MeshStandardMaterial({
      color: 0x788842,
      roughness: 0.92,
      metalness: 0,
    });
    this.terrainMesh = new THREE.Mesh(this.terrainGeometry, this.terrainMaterial);
    this.terrainMesh.name = 'terrain';
    this.terrainMesh.receiveShadow = true;
    this.scene.add(this.terrainMesh);
    this.refreshGridHelper();
    this.updateTerrainHeatmap();
  }

  refreshGridHelper(): void {
    if (this.gridHelper) {
      this.scene.remove(this.gridHelper);
      this.gridHelper.geometry.dispose();
      const material = this.gridHelper.material;
      if (Array.isArray(material)) {
        material.forEach((item) => item.dispose());
      } else {
        material.dispose();
      }
    }

    const divisions = Math.max(1, Math.round(this.terrainSize / EDITOR_GRID_SIZE));
    this.gridHelper = new THREE.GridHelper(this.terrainSize, divisions, 0xd7e65c, 0x55663e);
    this.gridHelper.position.y = 0.35;
    this.gridHelper.renderOrder = 1;
    const material = this.gridHelper.material;
    if (!Array.isArray(material)) {
      material.transparent = true;
      material.opacity = 0.32;
    }
    this.scene.add(this.gridHelper);
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
    [
      this.waterLevelInput,
      this.waterTypeInput,
      this.waterFlowRateInput,
      this.waterMaxVolumeInput,
      this.waterBlocksMovementInput,
      this.waterSpeedMultiplierInput,
      this.waterDepthBlockThresholdInput,
      this.waterProjectileImpactInput,
      this.waterExplosionMultiplierInput,
    ].forEach((input) => {
      input.addEventListener('input', () => this.updateSelectedWaterFromControls());
      input.addEventListener('change', () => this.updateSelectedWaterFromControls());
    });
    document.getElementById('editor-apply-size')?.addEventListener('click', () => this.applyTerrainSize());
    document.getElementById('editor-reset-terrain')?.addEventListener('click', () => this.resetTerrain());
    document.getElementById('editor-rotate-left')?.addEventListener('click', () => this.rotateSelection(-Math.PI / 2));
    document.getElementById('editor-rotate-right')?.addEventListener('click', () => this.rotateSelection(Math.PI / 2));
    document.getElementById('editor-group')?.addEventListener('click', () => this.groupSelection());
    document.getElementById('editor-delete')?.addEventListener('click', () => this.deleteSelection());
    document.getElementById('editor-export-package')?.addEventListener('click', () => void this.exportPackage());
    document.getElementById('editor-import-package')?.addEventListener('click', () => this.importPackageInput.click());
    this.importPackageInput.addEventListener('change', () => {
      const file = this.importPackageInput.files?.[0];
      this.importPackageInput.value = '';
      if (file) {
        void this.importMapPackage(file);
      }
    });
    this.heatmapInput.addEventListener('change', () => {
      this.heatmapEnabled = this.heatmapInput.checked;
      this.updateTerrainHeatmap();
    });
    this.waterListElement.addEventListener('click', (event) => this.handleWaterListClick(event));

    this.renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());
    this.renderer.domElement.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    this.renderer.domElement.addEventListener('pointermove', (event) => this.onPointerMove(event));
    window.addEventListener('pointerup', () => {
      const shouldRefreshWater = this.isPainting || Boolean(this.dragState);
      this.isPainting = false;
      this.isOrbiting = false;
      this.dragState = null;
      if (shouldRefreshWater) {
        this.refreshWaterPreview();
      }
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
    this.updateTerrainHeatmap();
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
    const placement = this.placementFromPointer();
    this.lastPlacement = placement;
    if (!placement) {
      this.ghostMesh.visible = false;
      return;
    }

    const preset = this.currentPreset();
    const height = preset.size[2];
    this.ghostMesh.visible = true;
    this.ghostMesh.position.set(placement.point.x, placement.point.y + height / 2, placement.point.z);
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
    this.refreshWaterPreview();
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

  createElementMeshFromData(data: GroundfireMapElement): THREE.Mesh {
    const material = new THREE.MeshStandardMaterial({
      color: this.materialColor(data.material),
      roughness: 0.86,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(data.size[0], data.size[2], data.size[1]), material);
    mesh.position.set(data.position[0], data.position[2] + data.size[2] / 2, data.position[1]);
    mesh.rotation.y = data.rotation[2] ?? 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.elementId = data.id;
    return mesh;
  }

  materialColor(materialKey: string): THREE.ColorRepresentation {
    return MAP_ASSET_MANIFEST.materials.find((material) => material.key === materialKey)?.color ?? '#8a8062';
  }

  baseElementIdUnderGhost(): string | null {
    return this.lastPlacement?.baseElementId ?? null;
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

  placementFromPointer(): PlacementSample | null {
    const hit = this.intersectPlacement();
    if (!hit) {
      return null;
    }

    return this.surfaceAtGridPoint(this.snapToGrid(hit.point.x), this.snapToGrid(hit.point.z));
  }

  surfaceAtGridPoint(x: number, z: number): PlacementSample {
    const meshes = [
      ...Array.from(this.elements.values()).map((element) => element.mesh),
      this.terrainMesh,
    ];
    const surfaceRay = new THREE.Raycaster(
        new THREE.Vector3(x, 10000, z),
        new THREE.Vector3(0, -1, 0),
        0,
        20000,
    );
    const [hit] = surfaceRay.intersectObjects(meshes, false);
    if (!hit) {
      return {
        point: new THREE.Vector3(x, this.heightAt(x, z), z),
        baseElementId: null,
      };
    }

    const elementId = hit.object.userData.elementId;
    return {
      point: new THREE.Vector3(x, this.topSurfaceFromHit(hit), z),
      baseElementId: typeof elementId === 'string' ? elementId : null,
    };
  }

  snapToGrid(value: number): number {
    const halfSize = this.terrainSize / 2;
    return THREE.MathUtils.clamp(
        Math.round(value / EDITOR_GRID_SIZE) * EDITOR_GRID_SIZE,
        -halfSize,
        halfSize,
    );
  }

  snappedTerrainPoint(point: THREE.Vector3): THREE.Vector3 {
    const x = this.snapToGrid(point.x);
    const z = this.snapToGrid(point.z);
    return new THREE.Vector3(x, this.heightAt(x, z), z);
  }

  handleSelection(append: boolean): void {
    const hit = this.intersectObjects();
    const id = typeof hit?.object.userData.elementId === 'string' ? hit.object.userData.elementId : null;
    if (!id) {
      const waterHit = this.intersectWater();
      const waterId = typeof waterHit?.object.userData.waterSourceId === 'string'
        ? waterHit.object.userData.waterSourceId
        : null;
      if (waterId) {
        this.selectWater(waterId);
        return;
      }

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

    this.selectedWaterId = null;
    this.syncSelectionMaterials();
    this.syncWaterSelectionMaterials();
    this.renderWaterList();
    const terrainHit = this.intersectTerrain();
    if (terrainHit) {
      this.dragState = this.createDragState(this.snappedTerrainPoint(terrainHit.point));
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

    const anchor = this.snappedTerrainPoint(hit.point);
    this.dragState.ids.forEach((id) => {
      const element = this.elements.get(id);
      const offset = this.dragState?.offsets.get(id);
      if (!element || !offset) {
        return;
      }

      element.mesh.position.set(
          this.snapToGrid(anchor.x + offset.x),
          anchor.y + offset.y,
          this.snapToGrid(anchor.z + offset.z),
      );
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
    if (this.selectedWaterId && this.selectedIds.size === 0) {
      this.removeWaterSource(this.selectedWaterId);
      return;
    }

    this.selectedGroupIds().forEach((id) => {
      const element = this.elements.get(id);
      if (!element) {
        return;
      }
      this.disposeMesh(element.mesh);
      this.elements.delete(id);
    });
    this.groups = this.groups
      .map((group) => ({...group, elementIds: group.elementIds.filter((id) => this.elements.has(id))}))
      .filter((group) => group.elementIds.length > 1);
    this.clearSelection();
    this.refreshWaterPreview();
  }

  addWaterSource(): void {
    const hit = this.intersectTerrain();
    if (!hit) {
      return;
    }

    const waterSource: GroundfireWaterSource = {
      id: `water-${crypto.randomUUID().slice(0, 8)}`,
      type: this.waterTypeInput.value === 'source' || this.waterTypeInput.value === 'drain'
        ? this.waterTypeInput.value
        : 'basin',
      seedPoint: [hit.point.x, hit.point.z],
      waterLevel: Number(this.waterLevelInput.value) || hit.point.y,
      flowRate: this.optionalNumberInput(this.waterFlowRateInput),
      maxVolume: this.optionalNumberInput(this.waterMaxVolumeInput),
      gameplay: this.waterGameplayFromInputs(),
      material: 'water-clear',
    };
    this.waterSources.push(waterSource);
    this.selectedWaterId = waterSource.id;
    this.clearElementSelection();
    this.refreshWaterPreview();
    this.renderWaterList();
    this.setStatus('Water source added');
  }

  refreshWaterPreview(): void {
    this.waterMeshes.forEach((mesh) => {
      this.disposeMesh(mesh);
    });
    this.waterMeshes = [];
    this.waterSources.forEach((waterSource) => {
      const mesh = this.createWaterPreviewMesh(waterSource);
      if (mesh) {
        mesh.name = `water:${waterSource.id}`;
        mesh.userData.waterSourceId = waterSource.id;
        this.waterMeshes.push(mesh);
        this.scene.add(mesh);
      }
    });
    this.syncWaterSelectionMaterials();
  }

  createWaterPreviewMesh(waterSource: GroundfireWaterSource): THREE.Mesh | null {
    if (waterSource.type === 'drain') {
      return null;
    }

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
      return this.heightAt(center.x, center.z) <= waterSource.waterLevel
        && !this.waterCellBlockedByElement(center.x, center.z, waterSource.waterLevel, cellSize);
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

  waterCellBlockedByElement(x: number, z: number, waterLevel: number, cellSize: number): boolean {
    const halfSize = cellSize / 2;
    const cellBox = new THREE.Box3(
        new THREE.Vector3(x - halfSize, waterLevel - 2, z - halfSize),
        new THREE.Vector3(x + halfSize, waterLevel + 2, z + halfSize),
    );

    return Array.from(this.elements.values()).some((element) => {
      const elementBox = new THREE.Box3().setFromObject(element.mesh);
      if (waterLevel < elementBox.min.y - 2 || waterLevel > elementBox.max.y + 2) {
        return false;
      }

      const elementFootprint = new THREE.Box3(
          new THREE.Vector3(elementBox.min.x, waterLevel - 2, elementBox.min.z),
          new THREE.Vector3(elementBox.max.x, waterLevel + 2, elementBox.max.z),
      ).expandByScalar(cellSize * 0.08);
      return cellBox.intersectsBox(elementFootprint);
    });
  }

  handleWaterListClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const row = target.closest<HTMLElement>('[data-water-id]');
    const waterId = row?.dataset.waterId;
    if (!waterId) {
      return;
    }

    if (target.matches('[data-water-action="remove"]')) {
      this.removeWaterSource(waterId);
      return;
    }

    this.selectWater(waterId);
  }

  renderWaterList(): void {
    if (this.waterSources.length === 0) {
      this.waterListElement.innerHTML = '<p class="editor__empty">No water sources</p>';
      return;
    }

    this.waterListElement.innerHTML = this.waterSources.map((waterSource, index) => {
      const selectedClass = waterSource.id === this.selectedWaterId ? ' editor__water-item--selected' : '';
      const [x, z] = waterSource.seedPoint;
      return `
        <button class="editor__water-item${selectedClass}" type="button" data-water-id="${waterSource.id}">
          <span>
            <strong>Water ${index + 1} - ${waterSource.type ?? 'basin'}</strong>
            <small>x ${Math.round(x)} | z ${Math.round(z)} | level ${Math.round(waterSource.waterLevel)} | speed ${waterSource.gameplay?.speedMultiplier ?? 0.45}</small>
          </span>
          <span class="editor__water-remove" data-water-action="remove" aria-label="Remove water">X</span>
        </button>
      `;
    }).join('');
  }

  selectWater(waterId: string): void {
    if (!this.waterSources.some((waterSource) => waterSource.id === waterId)) {
      return;
    }

    this.selectedWaterId = waterId;
    this.clearElementSelection();
    this.syncWaterControls();
    this.syncWaterSelectionMaterials();
    this.renderWaterList();
    this.setStatus('Water selected');
  }

  selectedWater(): GroundfireWaterSource | null {
    return this.selectedWaterId
      ? this.waterSources.find((waterSource) => waterSource.id === this.selectedWaterId) ?? null
      : null;
  }

  syncWaterControls(): void {
    const waterSource = this.selectedWater();
    if (!waterSource) {
      return;
    }

    this.waterLevelInput.value = String(waterSource.waterLevel);
    this.waterTypeInput.value = waterSource.type ?? 'basin';
    this.waterFlowRateInput.value = String(waterSource.flowRate ?? 0);
    this.waterMaxVolumeInput.value = String(waterSource.maxVolume ?? 0);
    this.waterBlocksMovementInput.checked = Boolean(waterSource.gameplay?.blocksMovement);
    this.waterSpeedMultiplierInput.value = String(waterSource.gameplay?.speedMultiplier ?? 0.45);
    this.waterDepthBlockThresholdInput.value = String(waterSource.gameplay?.depthBlockThreshold ?? 28);
    this.waterProjectileImpactInput.value = waterSource.gameplay?.projectileImpact ?? 'splash';
    this.waterExplosionMultiplierInput.value = String(waterSource.gameplay?.explosionMultiplier ?? 0.35);
  }

  updateSelectedWaterFromControls(): void {
    const waterSource = this.selectedWater();
    if (!waterSource) {
      return;
    }

    waterSource.waterLevel = Number(this.waterLevelInput.value) || 0;
    waterSource.type = this.waterTypeInput.value === 'source' || this.waterTypeInput.value === 'drain'
      ? this.waterTypeInput.value
      : 'basin';
    waterSource.flowRate = this.optionalNumberInput(this.waterFlowRateInput);
    waterSource.maxVolume = this.optionalNumberInput(this.waterMaxVolumeInput);
    waterSource.gameplay = this.waterGameplayFromInputs();
    this.refreshWaterPreview();
    this.renderWaterList();
    this.setStatus('Water updated');
  }

  waterGameplayFromInputs(): NonNullable<GroundfireWaterSource['gameplay']> {
    const projectileImpact = this.waterProjectileImpactInput.value === 'pass-through'
      || this.waterProjectileImpactInput.value === 'none'
      ? this.waterProjectileImpactInput.value
      : 'splash';
    return {
      blocksMovement: this.waterBlocksMovementInput.checked,
      speedMultiplier: THREE.MathUtils.clamp(Number(this.waterSpeedMultiplierInput.value) || 0.45, 0.05, 1),
      depthBlockThreshold: Math.max(0, Number(this.waterDepthBlockThresholdInput.value) || 0),
      projectileImpact,
      explosionMultiplier: THREE.MathUtils.clamp(Number(this.waterExplosionMultiplierInput.value) || 0.35, 0, 1),
    };
  }

  optionalNumberInput(input: HTMLInputElement): number | undefined {
    const value = Number(input.value);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }

  removeWaterSource(waterId: string): void {
    const previousCount = this.waterSources.length;
    this.waterSources = this.waterSources.filter((waterSource) => waterSource.id !== waterId);
    if (this.selectedWaterId === waterId) {
      this.selectedWaterId = null;
    }

    if (this.waterSources.length === previousCount) {
      return;
    }

    this.refreshWaterPreview();
    this.renderWaterList();
    this.setStatus('Water removed');
  }

  async importMapPackage(file: File): Promise<void> {
    try {
      const entries = readStoredZipEntries(new Uint8Array(await file.arrayBuffer()));
      const mapEntry = entries.get('map.json');
      if (!mapEntry) {
        throw new Error('Map package does not contain map.json');
      }

      const rawMap = JSON.parse(new TextDecoder().decode(mapEntry)) as {
        terrain?: {
          heightmapAsset?: unknown;
        };
      };
      const map = normalizeGroundfireMap(rawMap, this.safeIdFromFileName(file.name));
      const heightmapEntryName = this.packageAssetName(entries, rawMap.terrain?.heightmapAsset, 'heightmap.png');
      const heightmapImageData = heightmapEntryName
        ? await this.imageDataFromBytes(entries.get(heightmapEntryName) ?? new Uint8Array(), 'image/png')
        : undefined;
      await this.loadMapIntoEditor(map, {heightmapImageData});
      this.setStatus(`Loaded package ${file.name}`);
    } catch (error) {
      console.error('Could not import map package', error);
      this.setStatus('Could not load map package');
    }
  }

  async loadMapIntoEditor(
      map: GroundfireMap,
      options: { heightmapImageData?: ImageData } = {},
  ): Promise<void> {
    this.clearEditorContent();
    this.mapNameInput.value = map.name;
    this.terrainSize = THREE.MathUtils.clamp(map.arena.size, 400, 10000);
    this.mapSizeInput.value = String(this.terrainSize);
    this.createTerrain();

    let heightmapLoaded = false;
    if (options.heightmapImageData) {
      this.applyHeightmapImageData(options.heightmapImageData, {
        heightScale: map.terrain.heightScale ?? 120,
        heightOffset: map.terrain.heightOffset ?? 0,
      });
      heightmapLoaded = true;
    }

    this.applyTerrainFeatures(map.terrain.features ?? []);
    this.elements = new Map();
    map.elements.forEach((element) => this.addElementFromData(this.cloneMapElement(element)));
    const existingElementIds = new Set(this.elements.keys());
    this.groups = map.groups
      .map((group) => ({
        id: typeof group.id === 'string' && group.id ? group.id : `group-${crypto.randomUUID().slice(0, 8)}`,
        name: typeof group.name === 'string' && group.name ? group.name : 'Group',
        elementIds: Array.isArray(group.elementIds)
          ? group.elementIds.filter((id) => existingElementIds.has(id))
          : [],
      }))
      .filter((group) => group.elementIds.length > 1);
    this.waterSources = map.water.map((waterSource, index) => {
      const seedPoint = Array.isArray(waterSource.seedPoint) ? waterSource.seedPoint : [0, 0];
      return {
        id: typeof waterSource.id === 'string' && waterSource.id ? waterSource.id : `water-${index + 1}`,
        type: waterSource.type ?? 'basin',
        seedPoint: [
          Number(seedPoint[0]) || 0,
          Number(seedPoint[1]) || 0,
        ],
        waterLevel: Number(waterSource.waterLevel) || 0,
        flowRate: waterSource.flowRate,
        maxVolume: waterSource.maxVolume,
        gameplay: waterSource.gameplay,
        material: typeof waterSource.material === 'string' ? waterSource.material : 'water-clear',
      };
    });
    this.clearSelection();
    this.refreshWaterPreview();
    this.renderWaterList();
    this.updateCamera();
    this.setStatus(heightmapLoaded ? `Loaded ${map.name} + heightmap` : `Loaded ${map.name}`);
  }

  clearEditorContent(): void {
    this.elements.forEach((element) => this.disposeMesh(element.mesh));
    this.elements.clear();
    this.groups = [];
    this.waterSources = [];
    this.selectedIds.clear();
    this.selectedWaterId = null;
    this.refreshWaterPreview();
    this.renderWaterList();
  }

  addElementFromData(data: GroundfireMapElement): void {
    const mesh = this.createElementMeshFromData(data);
    this.elements.set(data.id, {mesh, data});
    this.scene.add(mesh);
  }

  cloneMapElement(element: GroundfireMapElement): GroundfireMapElement {
    return {
      id: element.id,
      type: element.type,
      position: [...element.position],
      rotation: [...element.rotation],
      size: [...element.size],
      stacking: element.stacking
        ? {
          enabled: element.stacking.enabled,
          baseElementId: element.stacking.baseElementId ?? null,
        }
        : undefined,
      destructible: element.destructible
        ? {
          enabled: element.destructible.enabled,
          health: element.destructible.health,
        }
        : undefined,
      material: element.material,
      role: element.role,
    };
  }

  async imageDataFromBytes(bytes: Uint8Array, type: string): Promise<ImageData> {
    const url = URL.createObjectURL(new Blob([this.uint8BlobPart(bytes)], {type}));
    try {
      return await this.imageDataFromSource(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async imageDataFromSource(source: string): Promise<ImageData> {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Could not load image: ${source}`));
      img.src = source;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, image.naturalWidth || image.width);
    canvas.height = Math.max(1, image.naturalHeight || image.height);
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas 2D context is unavailable');
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return context.getImageData(0, 0, canvas.width, canvas.height);
  }

  applyHeightmapImageData(
      imageData: ImageData,
      settings: { heightScale: number; heightOffset: number },
  ): void {
    const positions = this.terrainGeometry.attributes.position;
    for (let row = 0; row < HEIGHTMAP_RESOLUTION; row += 1) {
      for (let column = 0; column < HEIGHTMAP_RESOLUTION; column += 1) {
        const index = row * HEIGHTMAP_RESOLUTION + column;
        const u = column / TERRAIN_SEGMENTS;
        const v = row / TERRAIN_SEGMENTS;
        const sample = this.sampleHeightmapImage(imageData, u, v);
        positions.setY(index, sample * settings.heightScale + settings.heightOffset);
      }
    }

    positions.needsUpdate = true;
    this.terrainGeometry.computeVertexNormals();
    this.updateTerrainHeatmap();
    this.refreshWaterPreview();
  }

  sampleHeightmapImage(imageData: ImageData, u: number, v: number): number {
    const x = THREE.MathUtils.clamp(u, 0, 1) * (imageData.width - 1);
    const y = THREE.MathUtils.clamp(v, 0, 1) * (imageData.height - 1);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(imageData.width - 1, x0 + 1);
    const y1 = Math.min(imageData.height - 1, y0 + 1);
    const tx = x - x0;
    const ty = y - y0;
    const top = THREE.MathUtils.lerp(this.heightmapPixel(imageData, x0, y0), this.heightmapPixel(imageData, x1, y0), tx);
    const bottom = THREE.MathUtils.lerp(this.heightmapPixel(imageData, x0, y1), this.heightmapPixel(imageData, x1, y1), tx);
    return THREE.MathUtils.lerp(top, bottom, ty);
  }

  heightmapPixel(imageData: ImageData, x: number, y: number): number {
    const index = (y * imageData.width + x) * 4;
    const red = imageData.data[index] ?? 0;
    const green = imageData.data[index + 1] ?? red;
    const blue = imageData.data[index + 2] ?? red;
    return (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
  }

  applyTerrainFeatures(features: GroundfireTerrainFeature[]): void {
    if (features.length === 0) {
      return;
    }

    const positions = this.terrainGeometry.attributes.position;
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const z = positions.getZ(index);
      const featureHeight = features.reduce((height, feature) => height + this.featureHeightAt(feature, x, z), 0);
      positions.setY(index, positions.getY(index) + featureHeight);
    }
    positions.needsUpdate = true;
    this.terrainGeometry.computeVertexNormals();
    this.updateTerrainHeatmap();
  }

  featureHeightAt(feature: GroundfireTerrainFeature, x: number, z: number): number {
    const [centerX, centerZ] = feature.center;
    const rotation = feature.rotation ?? 0;
    const cos = Math.cos(-rotation);
    const sin = Math.sin(-rotation);
    const localX = (x - centerX) * cos - (z - centerZ) * sin;
    const localZ = (x - centerX) * sin + (z - centerZ) * cos;
    const [radiusX, radiusZ] = Array.isArray(feature.radius)
      ? feature.radius
      : [feature.radius, feature.radius];
    const normalizedDistance = Math.sqrt(
        (localX * localX) / (radiusX * radiusX)
        + (localZ * localZ) / (radiusZ * radiusZ),
    );
    if (normalizedDistance >= 1) {
      return 0;
    }

    const falloff = Math.max(0.5, feature.falloff ?? 2);
    const smooth = Math.pow(1 - normalizedDistance * normalizedDistance, falloff);
    if (feature.type === 'depression') {
      return -Math.abs(feature.height) * smooth;
    }
    return feature.height * smooth;
  }

  safeIdFromFileName(fileName: string): string {
    return (fileName.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || 'imported-map').slice(0, 64);
  }

  packageAssetName(entries: Map<string, Uint8Array>, assetName: unknown, fallbackName: string): string | null {
    const candidates = new Set<string>();
    if (typeof assetName === 'string' && assetName.trim()) {
      const normalized = assetName
        .replace(/\\/g, '/')
        .replace(/^\/api\/maps\/[^/]+\/assets\//, '')
        .replace(/^\/+/, '')
        .replace(/^\.\//, '');
      candidates.add(normalized);
      candidates.add(normalized.split('/').pop() ?? normalized);
    }
    candidates.add(fallbackName);

    for (const candidate of candidates) {
      if (entries.has(candidate)) {
        return candidate;
      }
    }

    return Array.from(entries.keys()).find((entryName) => entryName.split('/').pop() === fallbackName) ?? null;
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
    this.updateTerrainHeatmap();
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

  intersectWater(): THREE.Intersection | null {
    const [hit] = this.raycaster.intersectObjects(this.waterMeshes, false);
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
    this.selectedWaterId = null;
    this.selectedIds = new Set([id]);
    this.syncSelectionMaterials();
    this.syncWaterSelectionMaterials();
    this.renderWaterList();
  }

  clearSelection(): void {
    this.selectedWaterId = null;
    this.clearElementSelection();
    this.syncWaterSelectionMaterials();
    this.renderWaterList();
  }

  clearElementSelection(): void {
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

  syncWaterSelectionMaterials(): void {
    this.waterMeshes.forEach((mesh) => {
      const selected = mesh.userData.waterSourceId === this.selectedWaterId;
      const material = mesh.material;
      if (Array.isArray(material)) {
        return;
      }
      if (material instanceof THREE.MeshStandardMaterial) {
        material.color = new THREE.Color(selected ? 0x7deeff : 0x35a9c6);
        material.emissive = new THREE.Color(selected ? 0x174452 : 0x000000);
        material.emissiveIntensity = selected ? 0.65 : 0;
        material.opacity = selected ? 0.72 : 0.52;
      }
    });
  }

  updateTerrainHeatmap(): void {
    if (!this.terrainGeometry || !this.terrainMaterial) {
      return;
    }

    if (!this.heatmapEnabled) {
      this.terrainGeometry.deleteAttribute('color');
      this.terrainMaterial.vertexColors = false;
      this.terrainMaterial.color.set(0x788842);
      this.terrainMaterial.needsUpdate = true;
      return;
    }

    const positions = this.terrainGeometry.attributes.position;
    const stats = this.heightStats();
    const range = Math.max(1, stats.max - stats.min);
    const colors = new Float32Array(positions.count * 3);
    const color = new THREE.Color();
    for (let index = 0; index < positions.count; index += 1) {
      const normalizedHeight = (positions.getY(index) - stats.min) / range;
      this.heatmapColor(normalizedHeight, color);
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }

    this.terrainGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.terrainMaterial.vertexColors = true;
    this.terrainMaterial.color.set(0xffffff);
    this.terrainMaterial.needsUpdate = true;
  }

  heatmapColor(value: number, target: THREE.Color): THREE.Color {
    const stops = [
      {at: 0, color: new THREE.Color(0x214c9a)},
      {at: 0.35, color: new THREE.Color(0x2caab3)},
      {at: 0.55, color: new THREE.Color(0x75a843)},
      {at: 0.78, color: new THREE.Color(0xf1ce4a)},
      {at: 1, color: new THREE.Color(0xc4472d)},
    ];
    const clamped = THREE.MathUtils.clamp(value, 0, 1);
    for (let index = 1; index < stops.length; index += 1) {
      const previous = stops[index - 1];
      const next = stops[index];
      if (clamped <= next.at) {
        return target.copy(previous.color).lerp(next.color, (clamped - previous.at) / (next.at - previous.at));
      }
    }
    return target.copy(stops[stops.length - 1].color);
  }

  disposeMesh(mesh: THREE.Mesh): void {
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((material) => material.dispose());
    } else {
      mesh.material.dispose();
    }
  }

  writeElementFromMesh(element: EditorElement): void {
    element.data.position = [
      element.mesh.position.x,
      element.mesh.position.z,
      element.mesh.position.y - element.data.size[2] / 2,
    ];
    element.data.rotation = [0, 0, element.mesh.rotation.y];
  }

  createMapDefinition(heightmapAsset: string): GroundfireMap {
    const heightStats = this.heightStats();
    const id = this.safeMapId();
    return {
      version: 2,
      id,
      name: this.mapNameInput.value.trim() || id,
      arena: {size: this.terrainSize},
      terrain: {
        resolution: HEIGHTMAP_RESOLUTION,
        heightmapAsset,
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
  }

  async exportPackage(): Promise<void> {
    const id = this.safeMapId();
    const heightmapBlob = await this.heightmapBlob();
    const zip = createStoredZip([
      {
        name: 'map.json',
        bytes: new TextEncoder().encode(JSON.stringify(this.createMapDefinition('heightmap.png'), null, 2)),
      },
      {
        name: 'heightmap.png',
        bytes: new Uint8Array(await heightmapBlob.arrayBuffer()),
      },
    ]);
    this.downloadBlob(`${id}.zip`, new Blob([this.uint8BlobPart(zip)], {type: 'application/zip'}), 'application/zip');
  }

  async heightmapBlob(): Promise<Blob> {
    const canvas = this.heightmapCanvas();
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });
    if (!blob) {
      throw new Error('Could not export heightmap');
    }
    return blob;
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
    return this.slugFromName(this.mapNameInput.value);
  }

  slugFromName(name: string): string {
    const normalizedName = name
      .trim()
      .replace(/[łŁ]/g, 'l')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return (normalizedName || 'custom-map').slice(0, 64);
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

  uint8BlobPart(bytes: Uint8Array): ArrayBuffer {
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return buffer;
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
