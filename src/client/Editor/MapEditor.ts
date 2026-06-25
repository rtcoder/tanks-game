import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {OBJLoader} from 'three/examples/jsm/loaders/OBJLoader.js';
import {ENVIRONMENT_PRESET_ORDER, environmentPresetDefinition} from '../../shared/environment';
import {type GroundfireElementPreset, MAP_ASSET_MANIFEST} from '../../shared/map-assets';
import {normalizeGroundfireMap} from '../../shared/map-normalizer';
import type {
  GroundfireDestructibleModel,
  GroundfireEnvironment,
  GroundfireMap,
  GroundfireMapElement,
  GroundfireMapGroup,
  GroundfireTerrainFeature,
  GroundfireTerrainSurfacePatch,
  GroundfireWaterSource,
} from '../../shared/types';
import {GroundfireEnvironmentPreset} from '../../shared/types';
import {createStoredZip, readStoredZipEntries} from '../../shared/zip';

type EditorTool = 'view' | 'raise' | 'lower' | 'smooth' | 'flatten' | 'paint' | 'place' | 'select' | 'water';

type EditorElement = {
  mesh: THREE.Mesh;
  data: GroundfireMapElement;
};

type DragState = {
  ids: string[];
  modelIds: string[];
  offsets: Map<string, THREE.Vector3>;
  modelOffsets: Map<string, THREE.Vector3>;
};

type PlacementSample = {
  point: THREE.Vector3;
  baseElementId: string | null;
};

type PaintShape = 'brush' | 'tile';

type ImportedModelPart = {
  id: string;
  name: string;
  sourceIndex: number;
  mesh: THREE.Mesh;
};

type ImportedModelSource = {
  name: string;
  extension: string;
  bytes?: Uint8Array;
  root: THREE.Group;
};

type EditorDestructibleModel = {
  data: GroundfireDestructibleModel;
  sourceBytes: Uint8Array;
  assetName: string;
};

type AutoModelBlockPlan = {
  width: number;
  depth: number;
  height: number;
  xCount: number;
  zCount: number;
  levelCount: number;
};

const HEIGHTMAP_RESOLUTION = 128;
const TERRAIN_SEGMENTS = HEIGHTMAP_RESOLUTION - 1;
const EDITOR_GRID_SIZE = 10;
const EDITOR_VIEW_NUDGE_PIXELS = 180;
const EDITOR_VIEW_ROTATE_STEP = Math.PI / 8;
const MODEL_IMPORT_TARGET_BLOCKS = 1400;
const MODEL_IMPORT_MIN_HORIZONTAL_BLOCK_SIZE = 20;
const MODEL_IMPORT_MAX_HORIZONTAL_BLOCK_SIZE = 110;
const MODEL_IMPORT_MAX_AXIS_SEGMENTS = 36;
const MODEL_IMPORT_MAX_BLOCK_HEIGHT = 50;
const MODEL_IMPORT_MIN_BUILDING_HEIGHT = 35;
const MODEL_IMPORT_GROUND_EPSILON = 12;
const MODEL_IMPORT_FLATNESS_RATIO = 0.12;
const MODEL_IMPORT_LARGE_FOOTPRINT_RATIO = 0.05;
const MODEL_IMPORT_RAYCAST_PADDING = 24;

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
  environmentHemiLight!: THREE.HemisphereLight;
  environmentSunLight!: THREE.DirectionalLight;
  gridHelper: THREE.GridHelper | null = null;
  ghostMesh!: THREE.Mesh;
  surfacePatchPreviewMesh!: THREE.Mesh;
  waterMeshes: THREE.Mesh[] = [];
  importedModelRoot: THREE.Group | null = null;
  importedModelSourceName = '';
  importedModelSourceExtension = '';
  importedModelSourceBytes: Uint8Array | null = null;
  importedModelParts = new Map<string, ImportedModelPart>();
  selectedImportedPartIds = new Set<string>();
  destructibleModels: EditorDestructibleModel[] = [];
  registeredModelPreviewRoots: THREE.Group[] = [];
  selectedModelIds = new Set<string>();
  elements = new Map<string, EditorElement>();
  groups: GroundfireMapGroup[] = [];
  surfacePatches: GroundfireTerrainSurfacePatch[] = [];
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
  terrainMaterialInput!: HTMLSelectElement;
  objectMaterialInput!: HTMLSelectElement;
  paintMaterialInput!: HTMLSelectElement;
  paintShapeInput!: HTMLSelectElement;
  surfaceTileWidthInput!: HTMLInputElement;
  surfaceTileDepthInput!: HTMLInputElement;
  surfaceFrictionInput!: HTMLInputElement;
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
  environmentPresetInput!: HTMLSelectElement;
  environmentTimeInput!: HTMLInputElement;
  environmentCycleInput!: HTMLInputElement;
  environmentCycleMinutesInput!: HTMLInputElement;
  environmentIntensityInput!: HTMLInputElement;
  environmentWindDirectionInput!: HTMLInputElement;
  environmentWindStrengthInput!: HTMLInputElement;
  environmentTractionInput!: HTMLInputElement;
  environmentProjectileDriftInput!: HTMLInputElement;
  environmentVisibilityInput!: HTMLInputElement;
  environmentRadarNoiseInput!: HTMLInputElement;
  importPackageInput!: HTMLInputElement;
  importModelInput!: HTMLInputElement;
  modelPartListElement!: HTMLElement;
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
  isPanning = false;
  paintRotation = 0;
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
    this.createSurfacePatchPreview();
    this.bindEvents();
    this.resize();
    this.animate();
    this.renderWaterList();
    this.updateToolPanels();
    this.setStatus(`Editor ready - grid ${EDITOR_GRID_SIZE}`);
  }

  template(): string {
    const presetOptions = MAP_ASSET_MANIFEST.elementPresets.map((preset) => (
        `<option value="${preset.key}">${preset.label}</option>`
    )).join('');
    const terrainMaterialOptions = MAP_ASSET_MANIFEST.terrainTextureSets.map((material) => (
        `<option value="${material.key}">${material.label}</option>`
    )).join('');
    const objectMaterialOptions = MAP_ASSET_MANIFEST.materials.map((material) => (
        `<option value="${material.key}">${material.label}</option>`
    )).join('');
    const environmentOptions = ENVIRONMENT_PRESET_ORDER.map((preset) => {
      const definition = environmentPresetDefinition(preset);
      return `<option value="${preset}">${definition.label}</option>`;
    }).join('');

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
          <section class="editor__section">
            <div class="editor__section-title">Environment</div>
            <label>Sky preset
              <select id="editor-environment-preset">${environmentOptions}</select>
            </label>
            <div class="editor__row">
              <label>Time<input id="editor-environment-time" type="number" min="0" max="24" step="0.25" value="13"></label>
              <label>Day min<input id="editor-environment-cycle-minutes" type="number" min="1" max="120" step="1" value="18"></label>
            </div>
            <label class="editor__check"><input id="editor-environment-cycle" type="checkbox"> Day cycle</label>
            <div class="editor__row">
              <label>Weather<input id="editor-environment-intensity" type="range" min="0" max="1" step="0.01" value="0"></label>
              <label>Wind str<input id="editor-environment-wind-strength" type="range" min="0" max="1" step="0.01" value="0.05"></label>
            </div>
            <label>Wind dir<input id="editor-environment-wind-direction" type="range" min="0" max="359" step="1" value="35"></label>
            <div class="editor__row">
              <label>Traction<input id="editor-environment-traction" type="number" min="0.25" max="1.35" step="0.01" value="1"></label>
              <label>Drift<input id="editor-environment-projectile-drift" type="number" min="0" max="0.5" step="0.01" value="0"></label>
            </div>
            <div class="editor__row">
              <label>Visibility<input id="editor-environment-visibility" type="number" min="0.2" max="1.2" step="0.01" value="1"></label>
              <label>Radar noise<input id="editor-environment-radar-noise" type="number" min="0" max="1" step="0.01" value="0"></label>
            </div>
          </section>
          <section class="editor__section">
            <div class="editor__section-title">Model map source</div>
            <input class="editor__file-input" id="editor-import-model-input" type="file" accept=".zip,.glb,.gltf,.obj,application/zip,application/x-zip-compressed,model/gltf-binary,model/gltf+json">
            <div class="editor__row">
              <button id="editor-import-model" type="button">Load model</button>
              <button id="editor-clear-model" type="button">Clear model</button>
            </div>
            <div class="editor__row">
              <button id="editor-model-register" type="button">Register destructible</button>
              <button id="editor-model-select-all" type="button">Select all parts</button>
            </div>
            <div class="editor__row">
              <button id="editor-model-set-terrain" type="button">Set as terrain</button>
              <button id="editor-model-duplicate" type="button">Duplicate selected</button>
            </div>
            <div class="editor__model-list" id="editor-model-part-list"></div>
          </section>
          <section class="editor__section editor__section--tools">
            <div class="editor__section-title">Tool</div>
            <select class="editor__tool-select" id="editor-tool" aria-label="Editor tool">
              <option value="view">Navigate view</option>
              <option value="raise">Raise</option>
              <option value="lower">Lower</option>
              <option value="smooth">Smooth</option>
              <option value="flatten">Flatten</option>
              <option value="paint">Paint surface</option>
              <option value="place">Place object</option>
              <option value="select">Select / move</option>
              <option value="water">Pour water</option>
            </select>
            <div class="editor__tool-grid" role="toolbar" aria-label="Editor tools">
              <button type="button" data-tool-button="view">View</button>
              <button type="button" data-tool-button="select">Select</button>
              <button type="button" data-tool-button="place">Place</button>
              <button type="button" data-tool-button="raise">Raise</button>
              <button type="button" data-tool-button="lower">Lower</button>
              <button type="button" data-tool-button="smooth">Smooth</button>
              <button type="button" data-tool-button="flatten">Flatten</button>
              <button type="button" data-tool-button="paint">Paint</button>
              <button type="button" data-tool-button="water">Water</button>
            </div>
          </section>
          <section class="editor__section" data-tool-panel="raise lower smooth flatten">
            <div class="editor__section-title">Terrain brush</div>
            <label>Brush size<input id="editor-brush-size" type="range" min="20" max="420" value="110"></label>
            <label>Brush strength<input id="editor-brush-strength" type="range" min="1" max="80" value="18"></label>
          </section>
          <section class="editor__section" data-tool-panel="flatten">
            <div class="editor__section-title">Flatten</div>
            <label>Flatten height<input id="editor-flatten-height" type="number" step="5" value="0"></label>
          </section>
          <section class="editor__section" data-tool-panel="view">
            <div class="editor__section-title">View</div>
            <div class="editor__row">
              <button id="editor-view-rotate-left" type="button">Turn L</button>
              <button id="editor-view-rotate-right" type="button">Turn R</button>
            </div>
            <div class="editor__view-pad">
              <span></span>
              <button id="editor-view-pan-up" type="button">Up</button>
              <span></span>
              <button id="editor-view-pan-left" type="button">Left</button>
              <button id="editor-view-reset" type="button">Reset</button>
              <button id="editor-view-pan-right" type="button">Right</button>
              <span></span>
              <button id="editor-view-pan-down" type="button">Down</button>
              <span></span>
            </div>
          </section>
          <section class="editor__section" data-tool-panel="paint">
            <div class="editor__section-title">Terrain materials</div>
            <label>Base terrain
              <select id="editor-terrain-material">${terrainMaterialOptions}</select>
            </label>
            <label>Paint mode
              <select id="editor-paint-shape">
                <option value="brush">Brush</option>
                <option value="tile">Tile rectangle</option>
              </select>
            </label>
            <div class="editor__row">
              <label>Paint material
                <select id="editor-paint-material">${terrainMaterialOptions}</select>
              </label>
              <label>Grip<input id="editor-surface-friction" type="number" min="0.05" max="3" step="0.05" value="1"></label>
            </div>
            <div class="editor__row">
              <label>Tile W<input id="editor-surface-tile-width" type="number" min="${EDITOR_GRID_SIZE}" max="1000" step="${EDITOR_GRID_SIZE}" value="40"></label>
              <label>Tile D<input id="editor-surface-tile-depth" type="number" min="${EDITOR_GRID_SIZE}" max="1000" step="${EDITOR_GRID_SIZE}" value="40"></label>
            </div>
          </section>
          <label data-tool-panel="place">Object
            <select id="editor-preset">${presetOptions}</select>
          </label>
          <section class="editor__section" data-tool-panel="place select">
            <div class="editor__section-title">Object materials</div>
            <label>Texture / material
              <select id="editor-object-material">${objectMaterialOptions}</select>
            </label>
            <div class="editor__row">
              <button id="editor-apply-material" type="button">Apply material</button>
              <button id="editor-apply-group-texture" type="button">Group texture</button>
            </div>
          </section>
          <label class="editor__check" data-tool-panel="place"><input id="editor-destructible" type="checkbox" checked> Destructible</label>
          <label data-tool-panel="place"><span>Health</span><input id="editor-health" type="number" min="1" max="9999" value="20"></label>
          <label data-tool-panel="water"><span>Water level</span><input id="editor-water-level" type="number" step="5" value="0"></label>
          <section class="editor__section" data-tool-panel="water">
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
          <section class="editor__section" data-tool-panel="water">
            <div class="editor__section-title">Water sources</div>
            <div class="editor__water-list" id="editor-water-list"></div>
          </section>
          <div class="editor__row" data-tool-panel="place select">
            <button id="editor-rotate-left" type="button">Rotate -90</button>
            <button id="editor-rotate-right" type="button">Rotate +90</button>
          </div>
          <div class="editor__row" data-tool-panel="select">
            <button id="editor-group" type="button">Group</button>
            <button id="editor-delete" type="button">Delete</button>
          </div>
          <div class="editor__row">
            <button id="editor-export-package" type="button">Export package</button>
          </div>
          <p class="editor__status" id="editor-status">Loading</p>
          <p class="editor__hint">Right mouse rotates. Shift + right mouse or middle mouse pans. Wheel zooms.</p>
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
    this.terrainMaterialInput = document.getElementById('editor-terrain-material') as HTMLSelectElement;
    this.objectMaterialInput = document.getElementById('editor-object-material') as HTMLSelectElement;
    this.paintMaterialInput = document.getElementById('editor-paint-material') as HTMLSelectElement;
    this.paintShapeInput = document.getElementById('editor-paint-shape') as HTMLSelectElement;
    this.surfaceTileWidthInput = document.getElementById('editor-surface-tile-width') as HTMLInputElement;
    this.surfaceTileDepthInput = document.getElementById('editor-surface-tile-depth') as HTMLInputElement;
    this.surfaceFrictionInput = document.getElementById('editor-surface-friction') as HTMLInputElement;
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
    this.environmentPresetInput = document.getElementById('editor-environment-preset') as HTMLSelectElement;
    this.environmentTimeInput = document.getElementById('editor-environment-time') as HTMLInputElement;
    this.environmentCycleInput = document.getElementById('editor-environment-cycle') as HTMLInputElement;
    this.environmentCycleMinutesInput = document.getElementById('editor-environment-cycle-minutes') as HTMLInputElement;
    this.environmentIntensityInput = document.getElementById('editor-environment-intensity') as HTMLInputElement;
    this.environmentWindDirectionInput = document.getElementById('editor-environment-wind-direction') as HTMLInputElement;
    this.environmentWindStrengthInput = document.getElementById('editor-environment-wind-strength') as HTMLInputElement;
    this.environmentTractionInput = document.getElementById('editor-environment-traction') as HTMLInputElement;
    this.environmentProjectileDriftInput = document.getElementById('editor-environment-projectile-drift') as HTMLInputElement;
    this.environmentVisibilityInput = document.getElementById('editor-environment-visibility') as HTMLInputElement;
    this.environmentRadarNoiseInput = document.getElementById('editor-environment-radar-noise') as HTMLInputElement;
    this.importPackageInput = document.getElementById('editor-import-package-input') as HTMLInputElement;
    this.importModelInput = document.getElementById('editor-import-model-input') as HTMLInputElement;
    this.modelPartListElement = document.getElementById('editor-model-part-list') as HTMLElement;
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

    this.environmentHemiLight = new THREE.HemisphereLight(0xffffff, 0x334026, 2.4);
    this.environmentSunLight = new THREE.DirectionalLight(0xfff1d0, 3.8);
    this.environmentSunLight.position.set(600, 900, 500);
    this.environmentSunLight.castShadow = true;
    this.scene.add(this.environmentHemiLight, this.environmentSunLight);
    this.applyEnvironmentPreview();
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
      color: this.terrainMaterialColor(this.terrainMaterialInput?.value || 'grassy-meadow'),
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

  createSurfacePatchPreview(): void {
    const material = new THREE.MeshBasicMaterial({
      color: this.terrainMaterialColor(this.paintMaterialInput?.value || 'asphalt-road'),
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.surfacePatchPreviewMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    this.surfacePatchPreviewMesh.rotation.x = -Math.PI / 2;
    this.surfacePatchPreviewMesh.position.y = 1;
    this.surfacePatchPreviewMesh.renderOrder = 3;
    this.surfacePatchPreviewMesh.visible = false;
    this.scene.add(this.surfacePatchPreviewMesh);
  }

  bindEvents(): void {
    window.addEventListener('resize', () => this.resize());
    this.toolInput.addEventListener('change', () => {
      this.setTool(this.toolInput.value as EditorTool);
    });
    document.querySelectorAll<HTMLButtonElement>('[data-tool-button]').forEach((button) => {
      button.addEventListener('click', () => this.setTool(button.dataset.toolButton as EditorTool));
    });
    this.brushSizeInput.addEventListener('input', () => {
      this.brushSize = Number(this.brushSizeInput.value);
      this.updateSurfacePatchPreview();
    });
    this.brushStrengthInput.addEventListener('input', () => {
      this.brushStrength = Number(this.brushStrengthInput.value);
    });
    this.presetInput.addEventListener('change', () => {
      this.objectMaterialInput.value = this.currentPreset().material;
      this.refreshGhost();
    });
    this.terrainMaterialInput.addEventListener('change', () => this.updateTerrainHeatmap());
    this.paintMaterialInput.addEventListener('change', () => {
      const material = this.terrainMaterialDefinition(this.paintMaterialInput.value);
      if (material?.friction) {
        this.surfaceFrictionInput.value = String(material.friction);
      }
      this.refreshSurfacePatchPreviewMaterial();
      this.updateSurfacePatchPreview();
    });
    this.paintShapeInput.addEventListener('change', () => this.updateSurfacePatchPreview());
    this.surfaceTileWidthInput.addEventListener('input', () => this.updateSurfacePatchPreview());
    this.surfaceTileDepthInput.addEventListener('input', () => this.updateSurfacePatchPreview());
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
    this.environmentPresetInput.addEventListener('change', () => {
      this.writeEnvironmentPresetDefaults(this.environmentPresetInput.value as GroundfireEnvironmentPreset);
      this.applyEnvironmentPreview();
    });
    [
      this.environmentTimeInput,
      this.environmentCycleInput,
      this.environmentCycleMinutesInput,
      this.environmentIntensityInput,
      this.environmentWindDirectionInput,
      this.environmentWindStrengthInput,
      this.environmentTractionInput,
      this.environmentProjectileDriftInput,
      this.environmentVisibilityInput,
      this.environmentRadarNoiseInput,
    ].forEach((input) => {
      input.addEventListener('input', () => this.applyEnvironmentPreview());
      input.addEventListener('change', () => this.applyEnvironmentPreview());
    });
    document.getElementById('editor-apply-size')?.addEventListener('click', () => this.applyTerrainSize());
    document.getElementById('editor-reset-terrain')?.addEventListener('click', () => this.resetTerrain());
    document.getElementById('editor-view-rotate-left')?.addEventListener('click', () => this.rotateView(-EDITOR_VIEW_ROTATE_STEP));
    document.getElementById('editor-view-rotate-right')?.addEventListener('click', () => this.rotateView(EDITOR_VIEW_ROTATE_STEP));
    document.getElementById('editor-view-pan-up')?.addEventListener('click', () => this.panView(0, EDITOR_VIEW_NUDGE_PIXELS));
    document.getElementById('editor-view-pan-down')?.addEventListener('click', () => this.panView(0, -EDITOR_VIEW_NUDGE_PIXELS));
    document.getElementById('editor-view-pan-left')?.addEventListener('click', () => this.panView(EDITOR_VIEW_NUDGE_PIXELS, 0));
    document.getElementById('editor-view-pan-right')?.addEventListener('click', () => this.panView(-EDITOR_VIEW_NUDGE_PIXELS, 0));
    document.getElementById('editor-view-reset')?.addEventListener('click', () => this.resetView());
    document.getElementById('editor-rotate-left')?.addEventListener('click', () => this.rotateSelection(-Math.PI / 2));
    document.getElementById('editor-rotate-right')?.addEventListener('click', () => this.rotateSelection(Math.PI / 2));
    document.getElementById('editor-apply-material')?.addEventListener('click', () => this.applyMaterialToSelection(false));
    document.getElementById('editor-apply-group-texture')?.addEventListener('click', () => this.applyMaterialToSelection(true));
    document.getElementById('editor-group')?.addEventListener('click', () => this.groupSelection());
    document.getElementById('editor-delete')?.addEventListener('click', () => this.deleteSelection());
    document.getElementById('editor-export-package')?.addEventListener('click', () => void this.exportPackage());
    document.getElementById('editor-import-package')?.addEventListener('click', () => this.importPackageInput.click());
    document.getElementById('editor-import-model')?.addEventListener('click', () => this.importModelInput.click());
    document.getElementById('editor-clear-model')?.addEventListener('click', () => this.clearImportedModel());
    document.getElementById('editor-model-generate')?.addEventListener('click', () => this.generateBlocksFromImportedModel());
    document.getElementById('editor-model-register')?.addEventListener('click', () => void this.registerImportedModelAsDestructible());
    document.getElementById('editor-model-select-all')?.addEventListener('click', () => this.selectAllImportedModelParts());
    document.getElementById('editor-model-set-terrain')?.addEventListener('click', () => this.setImportedModelAsTerrain());
    document.getElementById('editor-model-duplicate')?.addEventListener('click', () => void this.duplicateSelectedModels());
    this.importPackageInput.addEventListener('change', () => {
      const file = this.importPackageInput.files?.[0];
      this.importPackageInput.value = '';
      if (file) {
        void this.importMapPackage(file);
      }
    });
    this.importModelInput.addEventListener('change', () => {
      const file = this.importModelInput.files?.[0];
      this.importModelInput.value = '';
      if (file) {
        void this.importModelSource(file);
      }
    });
    this.heatmapInput.addEventListener('change', () => {
      this.heatmapEnabled = this.heatmapInput.checked;
      this.updateTerrainHeatmap();
    });
    this.waterListElement.addEventListener('click', (event) => this.handleWaterListClick(event));
    this.modelPartListElement.addEventListener('click', (event) => this.handleModelPartListClick(event));

    this.renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());
    this.renderer.domElement.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    this.renderer.domElement.addEventListener('pointermove', (event) => this.onPointerMove(event));
    window.addEventListener('pointerup', () => {
      const shouldRefreshWater = this.isPainting || Boolean(this.dragState);
      this.isPainting = false;
      this.isOrbiting = false;
      this.isPanning = false;
      this.dragState = null;
      if (shouldRefreshWater) {
        this.refreshWaterPreview();
      }
    });
    this.renderer.domElement.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.cameraDistance = THREE.MathUtils.clamp(this.cameraDistance + event.deltaY * 1.2, 280, 5600);
      this.updateCamera();
      this.updateSurfacePatchPreview();
    }, {passive: false});
    window.addEventListener('keydown', (event) => {
      if (this.isEditableKeyboardTarget(event.target)) {
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        this.deleteSelection();
      }
    });
  }

  setTool(tool: EditorTool): void {
    this.tool = tool;
    this.toolInput.value = tool;
    this.ghostMesh.visible = tool === 'place';
    this.updateSurfacePatchPreview();
    this.updateToolPanels();
  }

  updateToolPanels(): void {
    document.querySelectorAll<HTMLElement>('[data-tool-panel]').forEach((element) => {
      const tools = (element.dataset.toolPanel ?? '').split(/\s+/).filter(Boolean);
      element.hidden = !tools.includes(this.tool);
    });
    document.querySelectorAll<HTMLButtonElement>('[data-tool-button]').forEach((button) => {
      const active = button.dataset.toolButton === this.tool;
      button.classList.toggle('editor__tool-button--active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  environmentFromInputs(): GroundfireEnvironment {
    const preset = ENVIRONMENT_PRESET_ORDER.includes(this.environmentPresetInput.value as GroundfireEnvironmentPreset)
        ? this.environmentPresetInput.value as GroundfireEnvironmentPreset
        : GroundfireEnvironmentPreset.Clear;
    const defaults = environmentPresetDefinition(preset);
    return {
      preset,
      timeOfDay: THREE.MathUtils.clamp(Number(this.environmentTimeInput.value) || defaults.timeOfDay, 0, 24),
      cycle: {
        enabled: this.environmentCycleInput.checked,
        minutesPerDay: THREE.MathUtils.clamp(Number(this.environmentCycleMinutesInput.value) || defaults.cycle.minutesPerDay, 1, 120),
      },
      weather: {
        intensity: THREE.MathUtils.clamp(Number(this.environmentIntensityInput.value) || 0, 0, 1),
        windDirection: ((Number(this.environmentWindDirectionInput.value) || defaults.weather.windDirection) % 360 + 360) % 360,
        windStrength: THREE.MathUtils.clamp(Number(this.environmentWindStrengthInput.value) || 0, 0, 1),
      },
      gameplay: {
        tractionMultiplier: THREE.MathUtils.clamp(Number(this.environmentTractionInput.value) || defaults.gameplay.tractionMultiplier, 0.25, 1.35),
        projectileDrift: THREE.MathUtils.clamp(Number(this.environmentProjectileDriftInput.value) || 0, 0, 0.5),
        visibilityMultiplier: THREE.MathUtils.clamp(Number(this.environmentVisibilityInput.value) || defaults.gameplay.visibilityMultiplier, 0.2, 1.2),
        radarNoise: THREE.MathUtils.clamp(Number(this.environmentRadarNoiseInput.value) || 0, 0, 1),
      },
    };
  }

  writeEnvironmentToInputs(environment: GroundfireEnvironment): void {
    this.environmentPresetInput.value = environment.preset;
    this.environmentTimeInput.value = String(environment.timeOfDay);
    this.environmentCycleInput.checked = environment.cycle.enabled;
    this.environmentCycleMinutesInput.value = String(environment.cycle.minutesPerDay);
    this.environmentIntensityInput.value = String(environment.weather.intensity);
    this.environmentWindDirectionInput.value = String(environment.weather.windDirection);
    this.environmentWindStrengthInput.value = String(environment.weather.windStrength);
    this.environmentTractionInput.value = String(environment.gameplay.tractionMultiplier);
    this.environmentProjectileDriftInput.value = String(environment.gameplay.projectileDrift);
    this.environmentVisibilityInput.value = String(environment.gameplay.visibilityMultiplier);
    this.environmentRadarNoiseInput.value = String(environment.gameplay.radarNoise);
    this.applyEnvironmentPreview();
  }

  writeEnvironmentPresetDefaults(preset: GroundfireEnvironmentPreset): void {
    const definition = environmentPresetDefinition(preset);
    this.writeEnvironmentToInputs({
      preset,
      timeOfDay: definition.timeOfDay,
      cycle: {...definition.cycle},
      weather: {...definition.weather},
      gameplay: {...definition.gameplay},
    });
  }

  applyEnvironmentPreview(): void {
    if (!this.environmentHemiLight || !this.environmentSunLight) {
      return;
    }
    const environment = this.environmentFromInputs();
    const definition = environmentPresetDefinition(environment.preset);
    const intensity = environment.weather.intensity;
    const fogNear = Math.max(120, definition.fog.near * (1 - intensity * 0.22));
    const fogFar = Math.max(fogNear + 400, definition.fog.far * (1 - intensity * 0.18));
    const sunDirection = this.editorSunDirection(definition.sun.azimuth, definition.sun.elevation);
    this.scene.background = new THREE.Color(definition.sky.top).lerp(new THREE.Color(definition.sky.horizon), 0.45);
    this.scene.fog = new THREE.Fog(definition.fog.color, fogNear, fogFar);
    this.environmentHemiLight.color.set(definition.hemi.sky);
    this.environmentHemiLight.groundColor.set(definition.hemi.ground);
    this.environmentHemiLight.intensity = definition.hemi.intensity;
    this.environmentSunLight.color.set(definition.sun.color);
    this.environmentSunLight.intensity = definition.sun.intensity;
    this.environmentSunLight.position.copy(sunDirection.multiplyScalar(760));
    this.renderer.toneMappingExposure = definition.exposure;
  }

  editorSunDirection(azimuthDegrees: number, elevationDegrees: number): THREE.Vector3 {
    const azimuth = THREE.MathUtils.degToRad(azimuthDegrees);
    const elevation = THREE.MathUtils.degToRad(elevationDegrees);
    return new THREE.Vector3(
        Math.cos(azimuth) * Math.cos(elevation),
        Math.sin(elevation),
        Math.sin(azimuth) * Math.cos(elevation),
    ).normalize();
  }

  onPointerDown(event: PointerEvent): void {
    this.updatePointer(event);
    this.lastPointer.set(event.clientX, event.clientY);

    if (event.button === 1 || (event.button === 2 && event.shiftKey)) {
      this.isPanning = true;
      return;
    }

    if (event.button === 2) {
      this.isOrbiting = true;
      return;
    }

    if (this.tool === 'view') {
      this.isPanning = true;
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

    if (this.isPanning) {
      const dx = event.clientX - this.lastPointer.x;
      const dy = event.clientY - this.lastPointer.y;
      this.panCamera(dx, dy);
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

    if (this.tool === 'paint') {
      this.updateSurfacePatchPreview();
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
    if (this.tool === 'paint') {
      if (this.paintShape() === 'tile') {
        this.addSurfaceTilePatch(centerX, centerZ);
      } else {
        this.addSurfacePatch(centerX, centerZ);
      }
      this.updateTerrainHeatmap();
      return;
    }

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

  addSurfacePatch(centerX: number, centerZ: number): void {
    const materialKey = this.paintMaterialInput.value || 'grassy-meadow';
    const friction = THREE.MathUtils.clamp(Number(this.surfaceFrictionInput.value) || 1, 0.05, 3);
    const previous = this.surfacePatches[this.surfacePatches.length - 1];
    if (previous) {
      const distance = Math.hypot(previous.center[0] - centerX, previous.center[1] - centerZ);
      if (distance < this.brushSize * 0.28 && previous.material === materialKey && previous.friction === friction) {
        return;
      }
    }

    this.surfacePatches.push({
      id: `surface-${crypto.randomUUID().slice(0, 8)}`,
      type: 'paint',
      shape: 'circle',
      center: [centerX, centerZ],
      radius: this.brushSize,
      material: materialKey,
      friction,
      opacity: 0.9,
    });
  }

  addSurfaceTilePatch(centerX: number, centerZ: number): void {
    const [width, depth] = this.surfaceTileSize();
    const materialKey = this.paintMaterialInput.value || 'grassy-meadow';
    const friction = THREE.MathUtils.clamp(Number(this.surfaceFrictionInput.value) || 1, 0.05, 3);
    const snappedX = this.snapToGrid(centerX);
    const snappedZ = this.snapToGrid(centerZ);
    const rotation = this.normalizedRightAngle(this.paintRotation);
    const previous = this.surfacePatches[this.surfacePatches.length - 1];
    if (
        previous?.shape === 'rect'
        && previous.center[0] === snappedX
        && previous.center[1] === snappedZ
        && previous.size?.[0] === width
        && previous.size?.[1] === depth
        && previous.material === materialKey
        && previous.friction === friction
        && this.normalizedRightAngle(previous.rotation ?? 0) === rotation
    ) {
      return;
    }

    this.surfacePatches.push({
      id: `surface-${crypto.randomUUID().slice(0, 8)}`,
      type: 'paint',
      shape: 'rect',
      center: [snappedX, snappedZ],
      radius: Math.hypot(width, depth) / 2,
      size: [width, depth],
      rotation,
      material: materialKey,
      friction,
      opacity: 0.96,
    });
  }

  averageNeighborHeight(index: number): number {
    const positions = this.terrainGeometry.attributes.position;
    const side = TERRAIN_SEGMENTS + 1;
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

  panCamera(dx: number, dy: number): void {
    const scale = THREE.MathUtils.clamp(this.cameraDistance * 0.0012, 0.35, 8);
    const right = new THREE.Vector3(Math.sin(this.cameraYaw), 0, -Math.cos(this.cameraYaw)).normalize();
    const forward = new THREE.Vector3(-Math.cos(this.cameraYaw), 0, -Math.sin(this.cameraYaw)).normalize();
    this.cameraTarget
        .addScaledVector(right, -dx * scale)
        .addScaledVector(forward, dy * scale);
    const halfSize = this.terrainSize / 2;
    this.cameraTarget.x = THREE.MathUtils.clamp(this.cameraTarget.x, -halfSize, halfSize);
    this.cameraTarget.z = THREE.MathUtils.clamp(this.cameraTarget.z, -halfSize, halfSize);
    this.cameraTarget.y = this.heightAt(this.cameraTarget.x, this.cameraTarget.z);
  }

  panView(dx: number, dy: number): void {
    this.panCamera(dx, dy);
    this.updateCamera();
    this.updateSurfacePatchPreview();
  }

  rotateView(delta: number): void {
    this.cameraYaw += delta;
    this.updateCamera();
    this.updateSurfacePatchPreview();
  }

  resetView(): void {
    this.cameraYaw = -Math.PI / 4;
    this.cameraPitch = 0.92;
    this.cameraDistance = 1750;
    this.cameraTarget.set(0, this.heightAt(0, 0), 0);
    this.updateCamera();
    this.updateSurfacePatchPreview();
  }

  isEditableKeyboardTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLInputElement
        || target instanceof HTMLSelectElement
        || target instanceof HTMLTextAreaElement;
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
      material: this.objectMaterialInput.value || preset.material,
      textureMapping: {
        mode: 'single',
        material: this.objectMaterialInput.value || preset.material,
      },
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
      color: ghost ? 0xd7ff58 : this.materialColor(this.objectMaterialInput?.value || preset.material),
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

  terrainMaterialColor(materialKey: string): THREE.ColorRepresentation {
    return this.terrainMaterialDefinition(materialKey)?.color ?? '#788842';
  }

  terrainMaterialDefinition(materialKey: string) {
    return MAP_ASSET_MANIFEST.terrainTextureSets.find((material) => material.key === materialKey);
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

  paintShape(): PaintShape {
    return this.paintShapeInput.value === 'tile' ? 'tile' : 'brush';
  }

  surfaceTileSize(): [number, number] {
    return [
      this.snapLengthToGrid(Number(this.surfaceTileWidthInput.value) || 40),
      this.snapLengthToGrid(Number(this.surfaceTileDepthInput.value) || 40),
    ];
  }

  snapLengthToGrid(value: number): number {
    return Math.max(EDITOR_GRID_SIZE, Math.round(value / EDITOR_GRID_SIZE) * EDITOR_GRID_SIZE);
  }

  normalizedRightAngle(angle: number): number {
    const quarterTurns = Math.round(angle / (Math.PI / 2));
    return quarterTurns * (Math.PI / 2);
  }

  updateSurfacePatchPreview(): void {
    if (!this.surfacePatchPreviewMesh) {
      return;
    }

    const shouldShow = this.tool === 'paint' && this.paintShape() === 'tile';
    if (!shouldShow) {
      this.surfacePatchPreviewMesh.visible = false;
      return;
    }

    const hit = this.intersectTerrain();
    if (!hit) {
      this.surfacePatchPreviewMesh.visible = false;
      return;
    }

    const [width, depth] = this.surfaceTileSize();
    const x = this.snapToGrid(hit.point.x);
    const z = this.snapToGrid(hit.point.z);
    this.surfacePatchPreviewMesh.visible = true;
    this.surfacePatchPreviewMesh.position.set(x, this.heightAt(x, z) + 1.2, z);
    this.surfacePatchPreviewMesh.rotation.set(-Math.PI / 2, 0, this.normalizedRightAngle(this.paintRotation));
    this.surfacePatchPreviewMesh.scale.set(width, depth, 1);
    this.refreshSurfacePatchPreviewMaterial();
  }

  refreshSurfacePatchPreviewMaterial(): void {
    if (!this.surfacePatchPreviewMesh) {
      return;
    }
    const material = this.surfacePatchPreviewMesh.material;
    if (Array.isArray(material)) {
      return;
    }
    if (material instanceof THREE.MeshBasicMaterial) {
      material.color.set(this.terrainMaterialColor(this.paintMaterialInput.value || 'asphalt-road'));
      material.needsUpdate = true;
    }
  }

  handleSelection(append: boolean): void {
    const hit = this.intersectObjects();
    const id = typeof hit?.object.userData.elementId === 'string' ? hit.object.userData.elementId : null;
    if (!id) {
      const registeredModelHit = this.intersectRegisteredModels();
      const registeredModelId = this.registeredModelIdFromObject(registeredModelHit?.object ?? null);
      if (registeredModelId) {
        this.toggleRegisteredModelSelection(registeredModelId, append);
        const terrainHit = this.intersectTerrain();
        if (terrainHit) {
          this.dragState = this.createDragState(this.snappedTerrainPoint(terrainHit.point));
        }
        return;
      }

      const modelPartHit = this.intersectImportedModelParts();
      const modelPartId = typeof modelPartHit?.object.userData.importedModelPartId === 'string'
          ? modelPartHit.object.userData.importedModelPartId
          : null;
      if (modelPartId) {
        this.toggleImportedModelPart(modelPartId, append);
        return;
      }

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
    this.selectedModelIds.clear();
    this.selectedImportedPartIds.clear();
    this.syncImportedModelSelectionMaterials();
    this.renderImportedModelParts();
    this.syncSelectionMaterials();
    this.syncRegisteredModelSelectionMaterials();
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
    const modelIds = Array.from(this.selectedModelIds);
    const modelOffsets = new Map<string, THREE.Vector3>();
    ids.forEach((id) => {
      const element = this.elements.get(id);
      if (element) {
        offsets.set(id, element.mesh.position.clone().sub(anchor));
      }
    });
    modelIds.forEach((id) => {
      const root = this.registeredModelPreviewRoot(id);
      if (root) {
        modelOffsets.set(id, root.position.clone().sub(anchor));
      }
    });
    return {ids, modelIds, offsets, modelOffsets};
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
    this.dragState.modelIds.forEach((id) => {
      const model = this.destructibleModels.find((item) => item.data.id === id);
      const root = this.registeredModelPreviewRoot(id);
      const offset = this.dragState?.modelOffsets.get(id);
      if (!model || !root || !offset) {
        return;
      }

      root.position.set(
          this.snapToGrid(anchor.x + offset.x),
          anchor.y + offset.y,
          this.snapToGrid(anchor.z + offset.z),
      );
      this.writeRegisteredModelFromRoot(model.data, root);
    });
  }

  selectedGroupIds(): string[] {
    const selected = Array.from(this.selectedIds);
    const group = this.groups.find((item) => selected.some((id) => item.elementIds.includes(id)));
    return group ? group.elementIds.filter((id) => this.elements.has(id)) : selected;
  }

  rotateSelection(delta: number): void {
    if (this.tool === 'paint' && this.paintShape() === 'tile') {
      this.paintRotation = this.normalizedRightAngle(this.paintRotation + delta);
      this.updateSurfacePatchPreview();
      return;
    }

    if (this.tool === 'place' || this.selectedIds.size === 0) {
      if (this.tool === 'select' && this.selectedModelIds.size > 0) {
        this.selectedModelIds.forEach((id) => {
          const model = this.destructibleModels.find((item) => item.data.id === id);
          const root = this.registeredModelPreviewRoot(id);
          if (!model || !root) {
            return;
          }
          root.rotation.y += delta;
          this.writeRegisteredModelFromRoot(model.data, root);
        });
        return;
      }
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

  applyMaterialToSelection(groupAtlas: boolean): void {
    const ids = this.selectedGroupIds();
    if (ids.length === 0) {
      this.setStatus('Select objects first');
      return;
    }

    const material = this.objectMaterialInput.value || 'brick-wall';
    if (!groupAtlas || ids.length === 1) {
      ids.forEach((id) => {
        const element = this.elements.get(id);
        if (!element) {
          return;
        }
        element.data.material = material;
        element.data.textureMapping = {mode: 'single', material};
        this.updateElementPreviewMaterial(element);
      });
      this.setStatus(`Applied ${material} to ${ids.length} objects`);
      return;
    }

    const group = this.ensureGroupForIds(ids);
    const bounds = this.elementFootprintBounds(ids);
    const width = Math.max(1, bounds.maxX - bounds.minX);
    const depth = Math.max(1, bounds.maxZ - bounds.minZ);
    group.material = material;
    group.textureMapping = {
      mode: 'group-atlas',
      material,
      bounds: [bounds.minX, bounds.minZ, width, depth],
    };

    ids.forEach((id) => {
      const element = this.elements.get(id);
      if (!element) {
        return;
      }

      const box = new THREE.Box3().setFromObject(element.mesh);
      const u = (box.min.x - bounds.minX) / width;
      const v = (box.min.z - bounds.minZ) / depth;
      const w = (box.max.x - box.min.x) / width;
      const h = (box.max.z - box.min.z) / depth;
      element.data.material = material;
      element.data.textureMapping = {
        mode: 'group-atlas',
        material,
        groupId: group.id,
        uv: [
          THREE.MathUtils.clamp(u, 0, 1),
          THREE.MathUtils.clamp(v, 0, 1),
          THREE.MathUtils.clamp(w, 0, 1),
          THREE.MathUtils.clamp(h, 0, 1),
        ],
      };
      this.updateElementPreviewMaterial(element);
    });
    this.setStatus(`Applied group texture to ${ids.length} objects`);
  }

  ensureGroupForIds(ids: string[]): GroundfireMapGroup {
    const existing = this.groups.find((group) => ids.some((id) => group.elementIds.includes(id)));
    if (existing) {
      existing.elementIds = Array.from(new Set([...existing.elementIds, ...ids])).filter((id) => this.elements.has(id));
      return existing;
    }

    const group: GroundfireMapGroup = {
      id: `group-${crypto.randomUUID().slice(0, 8)}`,
      name: `Group ${this.groups.length + 1}`,
      elementIds: ids,
    };
    this.groups.push(group);
    return group;
  }

  elementFootprintBounds(ids: string[]): { minX: number; minZ: number; maxX: number; maxZ: number } {
    const bounds = {
      minX: Number.POSITIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxZ: Number.NEGATIVE_INFINITY,
    };
    ids.forEach((id) => {
      const element = this.elements.get(id);
      if (!element) {
        return;
      }
      const box = new THREE.Box3().setFromObject(element.mesh);
      bounds.minX = Math.min(bounds.minX, box.min.x);
      bounds.minZ = Math.min(bounds.minZ, box.min.z);
      bounds.maxX = Math.max(bounds.maxX, box.max.x);
      bounds.maxZ = Math.max(bounds.maxZ, box.max.z);
    });
    return bounds;
  }

  updateElementPreviewMaterial(element: EditorElement): void {
    const material = element.mesh.material;
    if (Array.isArray(material)) {
      return;
    }
    if (material instanceof THREE.MeshStandardMaterial) {
      material.color.set(this.materialColor(element.data.material));
      material.needsUpdate = true;
    }
  }

  deleteSelection(): void {
    if (this.selectedWaterId && this.selectedIds.size === 0 && this.selectedModelIds.size === 0) {
      this.removeWaterSource(this.selectedWaterId);
      return;
    }

    if (this.selectedModelIds.size > 0) {
      const selected = new Set(this.selectedModelIds);
      this.registeredModelPreviewRoots
          .filter((root) => selected.has(root.userData.destructibleModelId))
          .forEach((root) => this.disposeObject(root));
      this.registeredModelPreviewRoots = this.registeredModelPreviewRoots
          .filter((root) => !selected.has(root.userData.destructibleModelId));
      this.destructibleModels = this.destructibleModels
          .filter((model) => !selected.has(model.data.id));
      this.selectedModelIds.clear();
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
    this.setStatus('Selection deleted');
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

  handleModelPartListClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const row = target.closest<HTMLElement>('[data-model-part-id]');
    const partId = row?.dataset.modelPartId;
    if (!partId) {
      return;
    }

    const append = event instanceof MouseEvent && (event.shiftKey || event.metaKey || event.ctrlKey);
    this.toggleImportedModelPart(partId, append);
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
    this.clearImportedModelSelection();
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

  async importModelSource(file: File): Promise<void> {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    try {
      const source = extension === 'zip'
          ? await this.importModelSourceFromZip(file)
          : await this.importModelSourceFromFile(file, extension);

      this.clearImportedModel();
      this.prepareImportedModel(source.root, source.name);
      this.scene.add(source.root);
      this.importedModelRoot = source.root;
      this.importedModelSourceName = source.name;
      this.importedModelSourceExtension = source.extension;
      this.importedModelSourceBytes = source.bytes ?? null;
      this.renderImportedModelParts();
      this.setStatus(`Loaded model ${source.name} - ${this.importedModelParts.size} parts`);
    } catch (error) {
      console.error('Could not import model source', error);
      this.setStatus('Could not load model source');
    }
  }

  async importModelSourceFromFile(file: File, extension: string): Promise<ImportedModelSource> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const url = URL.createObjectURL(new Blob([this.uint8BlobPart(bytes)], {type: this.mimeTypeForModelExtension(extension)}));
    try {
      return {
        name: file.name,
        extension,
        bytes: extension === 'glb' ? bytes : undefined,
        root: await this.loadModelFromUrl(url, extension),
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async importModelSourceFromZip(file: File): Promise<ImportedModelSource> {
    const entries = readStoredZipEntries(new Uint8Array(await file.arrayBuffer()));
    const modelEntryName = this.modelEntryNameFromZip(entries);
    if (!modelEntryName) {
      throw new Error('Model ZIP does not contain .glb, .gltf, or .obj');
    }

    const bytes = entries.get(modelEntryName);
    if (!bytes) {
      throw new Error(`Model entry is missing from ZIP: ${modelEntryName}`);
    }

    const extension = this.fileExtension(modelEntryName);
    if (extension === 'gltf') {
      return {
        name: `${file.name}/${modelEntryName}`,
        extension,
        root: await this.loadGltfFromZip(entries, modelEntryName, bytes),
      };
    }

    const url = URL.createObjectURL(new Blob([this.arrayBufferFromBytes(bytes)], {type: this.mimeTypeForModelExtension(extension)}));
    try {
      return {
        name: `${file.name}/${modelEntryName}`,
        extension,
        bytes: extension === 'glb' ? bytes : undefined,
        root: await this.loadModelFromUrl(url, extension),
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async loadModelFromUrl(url: string, extension: string): Promise<THREE.Group> {
    if (extension === 'glb' || extension === 'gltf') {
      return new Promise<THREE.Group>((resolve, reject) => {
        new GLTFLoader().load(url, (gltf) => resolve(gltf.scene), undefined, reject);
      });
    }
    if (extension === 'obj') {
      return new Promise<THREE.Group>((resolve, reject) => {
        new OBJLoader().load(url, resolve, undefined, reject);
      });
    }

    throw new Error(`Unsupported model extension: ${extension}`);
  }

  async loadGltfFromZip(
      entries: Map<string, Uint8Array>,
      modelEntryName: string,
      modelBytes: Uint8Array,
  ): Promise<THREE.Group> {
    const objectUrls: string[] = [];
    const modelDirectory = this.directoryName(modelEntryName);
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => {
      const entryName = this.zipEntryNameForAssetUrl(entries, url, modelDirectory);
      const bytes = entryName ? entries.get(entryName) : undefined;
      if (!entryName || !bytes) {
        return url;
      }

      const objectUrl = URL.createObjectURL(new Blob([this.arrayBufferFromBytes(bytes)], {type: this.mimeTypeForZipEntry(entryName)}));
      objectUrls.push(objectUrl);
      return objectUrl;
    });

    try {
      const source = new TextDecoder().decode(modelBytes);
      return await new Promise<THREE.Group>((resolve, reject) => {
        new GLTFLoader(manager).parse(source, `${modelDirectory}/`, (gltf) => resolve(gltf.scene), reject);
      });
    } finally {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    }
  }

  modelEntryNameFromZip(entries: Map<string, Uint8Array>): string | null {
    const modelEntries = Array.from(entries.keys())
        .filter((name) => !name.startsWith('__MACOSX/'))
        .filter((name) => ['glb', 'gltf', 'obj'].includes(this.fileExtension(name)));
    const preference = ['glb', 'gltf', 'obj'];
    modelEntries.sort((left, right) => {
      const leftScore = preference.indexOf(this.fileExtension(left));
      const rightScore = preference.indexOf(this.fileExtension(right));
      if (leftScore !== rightScore) {
        return leftScore - rightScore;
      }
      const leftSourceScore = left.startsWith('source/') ? -1 : 0;
      const rightSourceScore = right.startsWith('source/') ? -1 : 0;
      return leftSourceScore - rightSourceScore || left.localeCompare(right);
    });

    return modelEntries[0] ?? null;
  }

  zipEntryNameForAssetUrl(entries: Map<string, Uint8Array>, url: string, modelDirectory: string): string | null {
    if (/^(data|blob|https?):/i.test(url)) {
      return null;
    }

    const normalizedUrl = this.normalizeAssetUrl(url);
    const candidates = [
      normalizedUrl,
      `${modelDirectory}/${normalizedUrl}`,
      this.baseName(normalizedUrl),
    ].map((candidate) => candidate.replace(/^\/+/, '').replace(/\/+/g, '/'));

    for (const candidate of candidates) {
      if (entries.has(candidate)) {
        return candidate;
      }
    }

    const basename = this.baseName(normalizedUrl).toLowerCase();
    return Array.from(entries.keys()).find((name) => this.baseName(name).toLowerCase() === basename) ?? null;
  }

  normalizeAssetUrl(url: string): string {
    const clean = url.split('#')[0].split('?')[0];
    try {
      return decodeURIComponent(new URL(clean, window.location.href).pathname).replace(/^\/+/, '');
    } catch {
      return decodeURIComponent(clean).replace(/^\/+/, '');
    }
  }

  fileExtension(name: string): string {
    return name.split('.').pop()?.toLowerCase() ?? '';
  }

  directoryName(name: string): string {
    const index = name.lastIndexOf('/');
    return index >= 0 ? name.slice(0, index) : '';
  }

  baseName(name: string): string {
    return name.split('/').pop() ?? name;
  }

  mimeTypeForModelExtension(extension: string): string {
    if (extension === 'glb') {
      return 'model/gltf-binary';
    }
    if (extension === 'gltf') {
      return 'model/gltf+json';
    }
    if (extension === 'obj') {
      return 'text/plain';
    }
    return 'application/octet-stream';
  }

  mimeTypeForZipEntry(name: string): string {
    const extension = this.fileExtension(name);
    if (extension === 'png') {
      return 'image/png';
    }
    if (extension === 'jpg' || extension === 'jpeg') {
      return 'image/jpeg';
    }
    if (extension === 'webp') {
      return 'image/webp';
    }
    return this.mimeTypeForModelExtension(extension);
  }

  arrayBufferFromBytes(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  prepareImportedModel(root: THREE.Group, fileName: string): void {
    root.name = `model-source:${fileName}`;
    root.updateMatrixWorld(true);
    const sourceBox = new THREE.Box3().setFromObject(root);
    if (sourceBox.isEmpty()) {
      return;
    }

    const size = sourceBox.getSize(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z, 1);
    const targetSize = this.terrainSize * 0.72;
    const scale = THREE.MathUtils.clamp(targetSize / maxDimension, 0.02, 40);
    const center = sourceBox.getCenter(new THREE.Vector3());
    root.scale.multiplyScalar(scale);
    root.position.set(-center.x * scale, -sourceBox.min.y * scale, -center.z * scale);
    root.updateMatrixWorld(true);

    let index = 0;
    const usedNodeNames = new Set<string>();
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) {
        return;
      }

      const sourceIndex = index;
      const originalName = object.name.trim();
      let nodeName = originalName || `GF_CHUNK_${sourceIndex.toString().padStart(4, '0')}`;
      if (usedNodeNames.has(nodeName)) {
        nodeName = `${nodeName}_${sourceIndex.toString().padStart(4, '0')}`;
      }
      usedNodeNames.add(nodeName);
      object.name = nodeName;
      const partId = `model-part-${index.toString().padStart(3, '0')}-${crypto.randomUUID().slice(0, 6)}`;
      index += 1;
      object.userData.importedModelPartId = partId;
      object.userData.importedModelSourceIndex = sourceIndex;
      object.castShadow = false;
      object.receiveShadow = true;
      object.material = this.cloneImportedModelPreviewMaterial(object.material);
      this.importedModelParts.set(partId, {
        id: partId,
        name: originalName || nodeName,
        sourceIndex,
        mesh: object,
      });
    });
  }

  cloneImportedModelPreviewMaterial(material: THREE.Material | THREE.Material[]): THREE.Material | THREE.Material[] {
    const cloneOne = (source: THREE.Material): THREE.Material => {
      const clone = source.clone();
      clone.transparent = true;
      clone.opacity = Math.min(source.opacity || 1, 0.74);
      clone.depthWrite = false;
      clone.side = THREE.DoubleSide;
      if (clone instanceof THREE.MeshStandardMaterial) {
        clone.color.multiplyScalar(0.92);
        clone.emissive.set(0x0d2a32);
        clone.emissiveIntensity = 0.16;
      }
      clone.needsUpdate = true;
      return clone;
    };

    return Array.isArray(material)
        ? material.map((item) => cloneOne(item))
        : cloneOne(material);
  }

  clearImportedModel(): void {
    if (this.importedModelRoot) {
      this.scene.remove(this.importedModelRoot);
      this.importedModelRoot.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          this.disposeMaterial(object.material);
        }
      });
    }
    this.importedModelRoot = null;
    this.importedModelSourceName = '';
    this.importedModelSourceExtension = '';
    this.importedModelSourceBytes = null;
    this.importedModelParts.clear();
    this.selectedImportedPartIds.clear();
    this.renderImportedModelParts();
    this.setStatus('Model source cleared');
  }

  selectAllImportedModelParts(): void {
    this.selectedImportedPartIds = new Set(this.importedModelParts.keys());
    this.syncImportedModelSelectionMaterials();
    this.renderImportedModelParts();
    this.setStatus(`Selected ${this.selectedImportedPartIds.size} model parts`);
  }

  renderImportedModelParts(): void {
    if (!this.modelPartListElement) {
      return;
    }

    if (this.importedModelParts.size === 0) {
      this.modelPartListElement.innerHTML = '<p class="editor__empty">No model loaded</p>';
      return;
    }

    const selectedCount = this.selectedImportedPartIds.size;
    const parts = Array.from(this.importedModelParts.values()).slice(0, 12);
    this.modelPartListElement.innerHTML = `
      <p class="editor__empty">${this.importedModelParts.size} parts loaded - ${selectedCount || 'all'} used for generation</p>
      ${parts.map((part) => {
      const selectedClass = this.selectedImportedPartIds.has(part.id) ? ' editor__model-item--selected' : '';
      return `<button class="editor__model-item${selectedClass}" type="button" data-model-part-id="${part.id}">${part.name}</button>`;
    }).join('')}
    `;
  }

  toggleImportedModelPart(partId: string, append: boolean): void {
    if (!this.importedModelParts.has(partId)) {
      return;
    }

    if (!append) {
      this.selectedImportedPartIds.clear();
    }
    if (append && this.selectedImportedPartIds.has(partId)) {
      this.selectedImportedPartIds.delete(partId);
    } else {
      this.selectedImportedPartIds.add(partId);
    }

    this.clearElementSelection();
    this.selectedModelIds.clear();
    this.selectedWaterId = null;
    this.syncImportedModelSelectionMaterials();
    this.syncRegisteredModelSelectionMaterials();
    this.renderImportedModelParts();
    this.setStatus(`Selected ${this.selectedImportedPartIds.size} model part${this.selectedImportedPartIds.size === 1 ? '' : 's'}`);
  }

  async registerImportedModelAsDestructible(): Promise<boolean> {
    if (!this.importedModelRoot || this.importedModelParts.size === 0) {
      this.setStatus('Load a GLB model first');
      return false;
    }
    if (this.importedModelSourceExtension !== 'glb' || !this.importedModelSourceBytes) {
      this.setStatus('Destructible model export needs a packed .glb');
      return false;
    }

    const parts = this.importedModelGenerationParts()
        .slice()
        .sort((left, right) => left.sourceIndex - right.sourceIndex);
    if (parts.length === 0) {
      this.setStatus('No model chunks selected');
      return false;
    }
    const sourceId = this.safeIdFromFileName(this.baseName(this.importedModelSourceName)).slice(0, 32);
    const modelId = `model-${sourceId}-${crypto.randomUUID().slice(0, 8)}`;
    const assetName = `models/${modelId}.glb`;
    const health = Math.max(1, Number(this.healthInput.value) || 120);
    const root = this.importedModelRoot;
    const model: GroundfireDestructibleModel = {
      id: modelId,
      name: this.importedModelSourceName,
      asset: assetName,
      position: [root.position.x, root.position.z, root.position.y],
      rotation: [0, 0, root.rotation.y],
      scale: [root.scale.x, root.scale.y, root.scale.z],
      destructible: {
        enabled: true,
        health,
      },
      collision: {
        mode: 'chunk-mesh',
        spatialIndex: 'grid',
      },
      render: {
        mode: 'source-model',
        preserveMaterials: true,
      },
      chunking: {
        mode: 'source-nodes',
        fill: 'bounding-box',
        blockSize: [42, 42, 34],
        minBlockSize: [18, 18, 18],
        maxBlocksPerSourceChunk: 180,
        density: 0.0018,
      },
      chunks: parts.map((part) => ({
        id: `${modelId}:chunk-${part.sourceIndex.toString().padStart(4, '0')}`,
        name: part.name,
        nodeName: part.mesh.name,
        health,
        collider: 'mesh',
      })),
    };

    const sourceBytes = new Uint8Array(this.importedModelSourceBytes);
    this.destructibleModels.push({
      data: model,
      sourceBytes,
      assetName,
    });
    await this.addRegisteredModelPreview(model, sourceBytes);
    this.clearImportedModel();
    this.setStatus(`Registered destructible model: ${parts.length} chunks`);
    return true;
  }

  syncImportedModelSelectionMaterials(): void {
    this.importedModelParts.forEach((part) => {
      const selected = this.selectedImportedPartIds.has(part.id);
      const materials = Array.isArray(part.mesh.material) ? part.mesh.material : [part.mesh.material];
      materials.forEach((material) => {
        if (material instanceof THREE.MeshStandardMaterial) {
          material.color.set(selected ? 0xd7ff58 : 0xffffff);
          material.emissive.set(selected ? 0x445000 : 0x0d2a32);
          material.emissiveIntensity = selected ? 0.42 : 0.16;
          material.opacity = selected ? 0.92 : 0.74;
          material.needsUpdate = true;
          return;
        }
        material.opacity = selected ? 0.92 : 0.74;
        material.needsUpdate = true;
      });
    });
  }

  generateBlocksFromImportedModel(): void {
    const sourceParts = this.importedModelGenerationParts();
    if (sourceParts.length === 0) {
      this.setStatus('Load a model first');
      return;
    }

    this.clearGeneratedModelBlocks();

    const minLevel = 0;
    const sourceBox = this.importedModelBounds(sourceParts);
    const parts = this.importedModelBuildingParts(sourceParts, sourceBox);
    if (parts.length === 0) {
      this.setStatus('No building-like model parts found');
      return;
    }

    const modelBox = this.importedModelBounds(parts);
    const baseBlockSize = this.fitAutoModelBlockSize(parts, modelBox, minLevel);
    const material = this.objectMaterialInput.value || 'brick-wall';
    const health = Math.max(1, Number(this.healthInput.value) || 20);
    const createdIds: string[] = [];

    for (const part of parts) {
      const box = new THREE.Box3().setFromObject(part.mesh);
      if (box.isEmpty() || box.max.y <= minLevel) {
        continue;
      }

      const plan = this.autoModelBlockPlan(box, minLevel, baseBlockSize);
      for (let level = 0; level < plan.levelCount; level += 1) {
        const xCenters = this.centersForBounds(box.min.x, box.max.x, plan.width, level % 2 === 1);
        const zCenters = this.centersForBounds(box.min.z, box.max.z, plan.depth, level % 2 === 1);
        for (const centerX of xCenters) {
          for (const centerZ of zCenters) {
            const topY = this.importedPartTopAt(part.mesh, centerX, centerZ, box);
            const bottom = this.heightAt(centerX, centerZ) + level * MODEL_IMPORT_MAX_BLOCK_HEIGHT;
            if (topY === null || topY <= bottom + EDITOR_GRID_SIZE) {
              continue;
            }

            const blockHeight = Math.min(MODEL_IMPORT_MAX_BLOCK_HEIGHT, topY - bottom);
            if (blockHeight < EDITOR_GRID_SIZE) {
              continue;
            }

            if (createdIds.length >= MODEL_IMPORT_TARGET_BLOCKS) {
              this.addGeneratedModelGroup(createdIds, part.name);
              this.refreshWaterPreview();
              this.setStatus(`Generated ${createdIds.length} blocks - limit reached`);
              return;
            }
            createdIds.push(this.addGeneratedModelBlock({
              centerX,
              centerZ,
              bottom,
              width: plan.width,
              depth: plan.depth,
              height: blockHeight,
              material,
              health,
              sourceName: part.name,
            }));
          }
        }
      }
    }

    this.addGeneratedModelGroup(createdIds, parts.length === 1 ? parts[0].name : 'Model import');
    this.refreshWaterPreview();
    const skippedParts = sourceParts.length - parts.length;
    this.setStatus(`Generated ${createdIds.length} grounded building blocks - skipped ${skippedParts} flat parts`);
  }

  importedModelGenerationParts(): ImportedModelPart[] {
    const selected = Array.from(this.selectedImportedPartIds)
        .map((id) => this.importedModelParts.get(id))
        .filter((part): part is ImportedModelPart => Boolean(part));
    return selected.length > 0 ? selected : Array.from(this.importedModelParts.values());
  }

  importedModelBounds(parts: ImportedModelPart[]): THREE.Box3 {
    const bounds = new THREE.Box3();
    parts.forEach((part) => {
      const partBox = new THREE.Box3().setFromObject(part.mesh);
      if (!partBox.isEmpty()) {
        bounds.union(partBox);
      }
    });

    if (bounds.isEmpty()) {
      bounds.set(
          new THREE.Vector3(-MODEL_IMPORT_MAX_BLOCK_HEIGHT, 0, -MODEL_IMPORT_MAX_BLOCK_HEIGHT),
          new THREE.Vector3(MODEL_IMPORT_MAX_BLOCK_HEIGHT, MODEL_IMPORT_MAX_BLOCK_HEIGHT, MODEL_IMPORT_MAX_BLOCK_HEIGHT),
      );
    }

    return bounds;
  }

  importedModelBuildingParts(parts: ImportedModelPart[], modelBox: THREE.Box3): ImportedModelPart[] {
    const modelSize = modelBox.getSize(new THREE.Vector3());
    const modelFootprintArea = Math.max(1, modelSize.x * modelSize.z);
    return parts.filter((part) => this.isImportedModelBuildingPart(part, modelBox, modelFootprintArea));
  }

  isImportedModelBuildingPart(part: ImportedModelPart, modelBox: THREE.Box3, modelFootprintArea: number): boolean {
    const box = new THREE.Box3().setFromObject(part.mesh);
    if (box.isEmpty()) {
      return false;
    }

    const size = box.getSize(new THREE.Vector3());
    const height = size.y;
    const horizontalSpan = Math.max(size.x, size.z, 1);
    const footprintArea = Math.max(0, size.x * size.z);
    const nearGround = box.min.y <= modelBox.min.y + MODEL_IMPORT_GROUND_EPSILON;
    const flat = height < MODEL_IMPORT_MIN_BUILDING_HEIGHT || height / horizontalSpan < MODEL_IMPORT_FLATNESS_RATIO;
    const hugeFootprint = footprintArea > modelFootprintArea * MODEL_IMPORT_LARGE_FOOTPRINT_RATIO;
    const groundNamed = this.importedModelPartNameLooksFlat(part.name);

    if (nearGround && hugeFootprint && (flat || groundNamed)) {
      return false;
    }
    if (groundNamed && flat) {
      return false;
    }

    return height >= MODEL_IMPORT_MIN_BUILDING_HEIGHT;
  }

  importedModelPartNameLooksFlat(name: string): boolean {
    return /ground|terrain|floor|base|plane|road|street|sidewalk|pavement|water|sea|ocean|island|land/i.test(name);
  }

  importedPartTopAt(mesh: THREE.Mesh, x: number, z: number, box: THREE.Box3): number | null {
    const origin = new THREE.Vector3(x, box.max.y + MODEL_IMPORT_RAYCAST_PADDING, z);
    const raycaster = new THREE.Raycaster(
        origin,
        new THREE.Vector3(0, -1, 0),
        0,
        box.max.y - box.min.y + MODEL_IMPORT_RAYCAST_PADDING * 2,
    );
    const [hit] = raycaster.intersectObject(mesh, false);
    return hit?.point.y ?? null;
  }

  fitAutoModelBlockSize(parts: ImportedModelPart[], modelBox: THREE.Box3, minLevel: number): number {
    let blockSize = this.autoModelBaseBlockSize(modelBox);
    let estimatedBlocks = this.estimatedAutoModelBlockCount(parts, minLevel, blockSize);

    while (estimatedBlocks > MODEL_IMPORT_TARGET_BLOCKS && blockSize < MODEL_IMPORT_MAX_HORIZONTAL_BLOCK_SIZE) {
      const nextSize = Math.min(
          MODEL_IMPORT_MAX_HORIZONTAL_BLOCK_SIZE,
          Math.max(blockSize + 5, this.roundModelBlockSize(blockSize * 1.18)),
      );
      if (nextSize === blockSize) {
        break;
      }
      blockSize = nextSize;
      estimatedBlocks = this.estimatedAutoModelBlockCount(parts, minLevel, blockSize);
    }

    return blockSize;
  }

  autoModelBaseBlockSize(modelBox: THREE.Box3): number {
    const size = modelBox.getSize(new THREE.Vector3());
    const footprint = Math.max(size.x, size.z, EDITOR_GRID_SIZE);
    return this.roundModelBlockSize(THREE.MathUtils.clamp(
        footprint / 24,
        MODEL_IMPORT_MIN_HORIZONTAL_BLOCK_SIZE,
        MODEL_IMPORT_MAX_HORIZONTAL_BLOCK_SIZE,
    ));
  }

  estimatedAutoModelBlockCount(parts: ImportedModelPart[], minLevel: number, baseBlockSize: number): number {
    return parts.reduce((total, part) => {
      const box = new THREE.Box3().setFromObject(part.mesh);
      if (box.isEmpty() || box.max.y <= minLevel) {
        return total;
      }

      const plan = this.autoModelBlockPlan(box, minLevel, baseBlockSize);
      let partTotal = 0;
      for (let level = 0; level < plan.levelCount; level += 1) {
        const staggerOffset = level % 2 === 1 ? 1 : 0;
        partTotal += (plan.xCount + staggerOffset) * (plan.zCount + staggerOffset);
      }
      return total + partTotal;
    }, 0);
  }

  autoModelBlockPlan(box: THREE.Box3, minY: number, baseBlockSize: number): AutoModelBlockPlan {
    const size = box.getSize(new THREE.Vector3());
    const xCount = this.autoAxisSegmentCount(size.x, baseBlockSize);
    const zCount = this.autoAxisSegmentCount(size.z, baseBlockSize);
    const verticalExtent = Math.max(EDITOR_GRID_SIZE, box.max.y - minY);
    const levelCount = Math.max(1, Math.ceil(verticalExtent / MODEL_IMPORT_MAX_BLOCK_HEIGHT));

    return {
      width: Math.max(EDITOR_GRID_SIZE, size.x / xCount),
      depth: Math.max(EDITOR_GRID_SIZE, size.z / zCount),
      height: verticalExtent / levelCount,
      xCount,
      zCount,
      levelCount,
    };
  }

  autoAxisSegmentCount(extent: number, baseBlockSize: number): number {
    if (!Number.isFinite(extent) || extent <= baseBlockSize * 1.15) {
      return 1;
    }

    return Math.max(1, Math.min(MODEL_IMPORT_MAX_AXIS_SEGMENTS, Math.ceil(extent / baseBlockSize)));
  }

  roundModelBlockSize(value: number): number {
    return Math.round(value / 5) * 5;
  }

  centersForBounds(min: number, max: number, size: number, staggered: boolean): number[] {
    const extent = Math.max(0, max - min);
    if (extent <= 0) {
      return [(min + max) / 2];
    }

    const center = (min + max) / 2;
    const count = Math.max(1, Math.round(extent / size) + (staggered ? 1 : 0));
    const coveredExtent = count * size;
    const first = center - coveredExtent / 2 + size / 2;
    return Array.from({length: count}, (_, index) => first + index * size);
  }

  addGeneratedModelBlock(settings: {
    centerX: number;
    centerZ: number;
    bottom: number;
    width: number;
    depth: number;
    height: number;
    material: string;
    health: number;
    sourceName: string;
  }): string {
    const id = `model-block-${crypto.randomUUID().slice(0, 8)}`;
    const data: GroundfireMapElement = {
      id,
      type: 'building',
      position: [settings.centerX, settings.centerZ, settings.bottom],
      rotation: [0, 0, 0],
      size: [settings.width, settings.depth, settings.height],
      stacking: {enabled: true, baseElementId: null},
      destructible: {
        enabled: true,
        health: settings.health,
      },
      material: settings.material,
      textureMapping: {
        mode: 'single',
        material: settings.material,
      },
      role: 'building',
    };
    const mesh = this.createElementMeshFromData(data);
    mesh.userData.importSource = settings.sourceName;
    mesh.userData.generatedFromImportedModel = true;
    this.elements.set(id, {mesh, data});
    this.scene.add(mesh);
    return id;
  }

  clearGeneratedModelBlocks(): void {
    const generatedIds = new Set<string>();
    this.elements.forEach((element, id) => {
      const generatedFromModel = element.mesh.userData.generatedFromImportedModel === true
          || id.startsWith('model-block-')
          || typeof element.mesh.userData.importSource === 'string';
      if (!generatedFromModel) {
        return;
      }

      generatedIds.add(id);
      this.disposeMesh(element.mesh);
      this.elements.delete(id);
    });

    if (generatedIds.size === 0) {
      return;
    }

    this.groups = this.groups
        .map((group) => ({...group, elementIds: group.elementIds.filter((id) => !generatedIds.has(id))}))
        .filter((group) => group.elementIds.length > 1);
    this.clearSelection();
  }

  addGeneratedModelGroup(ids: string[], sourceName: string): void {
    if (ids.length < 2) {
      return;
    }
    this.groups.push({
      id: `group-${crypto.randomUUID().slice(0, 8)}`,
      name: `Import ${sourceName}`,
      elementIds: ids,
    });
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
        destructibleModels?: Array<{
          asset?: unknown;
        }>;
      };
      const map = normalizeGroundfireMap(rawMap, this.safeIdFromFileName(file.name));
      const heightmapEntryName = this.packageAssetName(entries, rawMap.terrain?.heightmapAsset, 'heightmap.png');
      const heightmapImageData = heightmapEntryName
          ? await this.imageDataFromBytes(entries.get(heightmapEntryName) ?? new Uint8Array(), 'image/png')
          : undefined;
      const modelAssets = new Map<string, Uint8Array>();
      map.destructibleModels.forEach((model) => {
        const modelEntryName = this.packageAssetName(entries, model.asset, this.baseName(model.asset));
        const modelBytes = modelEntryName ? entries.get(modelEntryName) : undefined;
        if (!modelEntryName || !modelBytes) {
          return;
        }
        modelAssets.set(model.asset, modelBytes);
        modelAssets.set(modelEntryName, modelBytes);
      });
      await this.loadMapIntoEditor(map, {heightmapImageData, modelAssets});
      this.setStatus(`Loaded package ${file.name}`);
    } catch (error) {
      console.error('Could not import map package', error);
      this.setStatus('Could not load map package');
    }
  }

  async loadMapIntoEditor(
      map: GroundfireMap,
      options: { heightmapImageData?: ImageData; modelAssets?: Map<string, Uint8Array> } = {},
  ): Promise<void> {
    this.clearImportedModel();
    this.clearEditorContent();
    this.mapNameInput.value = map.name;
    this.terrainSize = THREE.MathUtils.clamp(map.arena.size, 400, 10000);
    this.mapSizeInput.value = String(this.terrainSize);
    this.terrainMaterialInput.value = map.terrain.material.textureSet ?? map.materials.terrain ?? 'grassy-meadow';
    this.paintMaterialInput.value = this.terrainMaterialInput.value;
    this.surfaceFrictionInput.value = String(this.terrainMaterialDefinition(this.paintMaterialInput.value)?.friction ?? 1);
    this.writeEnvironmentToInputs(map.environment);
    this.surfacePatches = (map.terrain.surfacePatches ?? []).map((patch) => ({
      id: patch.id,
      type: 'paint',
      shape: patch.shape,
      center: [...patch.center],
      radius: patch.radius,
      size: patch.size ? [...patch.size] : undefined,
      rotation: patch.rotation,
      material: patch.material,
      friction: patch.friction,
      opacity: patch.opacity,
    }));
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
          material: group.material,
          textureMapping: group.textureMapping
              ? {
                mode: 'group-atlas' as const,
                material: group.textureMapping.material,
                bounds: [
                  group.textureMapping.bounds[0],
                  group.textureMapping.bounds[1],
                  group.textureMapping.bounds[2],
                  group.textureMapping.bounds[3],
                ] as [number, number, number, number],
              }
              : undefined,
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
    for (const model of map.destructibleModels) {
      const bytes = options.modelAssets?.get(model.asset) ?? options.modelAssets?.get(this.baseName(model.asset));
      if (!bytes) {
        continue;
      }
      this.destructibleModels.push({
        data: model,
        sourceBytes: new Uint8Array(bytes),
        assetName: model.asset,
      });
      await this.addRegisteredModelPreview(model, bytes);
    }
    this.clearSelection();
    this.refreshWaterPreview();
    this.renderWaterList();
    this.updateCamera();
    this.setStatus(heightmapLoaded ? `Loaded ${map.name} + heightmap` : `Loaded ${map.name}`);
  }

  clearEditorContent(): void {
    this.elements.forEach((element) => this.disposeMesh(element.mesh));
    this.elements.clear();
    this.registeredModelPreviewRoots.forEach((root) => this.disposeObject(root));
    this.registeredModelPreviewRoots = [];
    this.destructibleModels = [];
    this.groups = [];
    this.surfacePatches = [];
    this.waterSources = [];
    this.selectedIds.clear();
    this.selectedModelIds.clear();
    this.selectedWaterId = null;
    if (this.surfacePatchPreviewMesh) {
      this.surfacePatchPreviewMesh.visible = false;
    }
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
      textureMapping: element.textureMapping
          ? {
            mode: element.textureMapping.mode,
            material: element.textureMapping.material,
            groupId: element.textureMapping.groupId,
            uv: element.textureMapping.uv ? [...element.textureMapping.uv] : undefined,
          }
          : undefined,
      role: element.role,
    };
  }

  async addRegisteredModelPreview(model: GroundfireDestructibleModel, bytes: Uint8Array): Promise<void> {
    const url = URL.createObjectURL(new Blob([this.uint8BlobPart(bytes)], {type: 'model/gltf-binary'}));
    try {
      const root = await this.loadModelFromUrl(url, 'glb');
      root.name = `registered-model:${model.id}`;
      root.userData.destructibleModelId = model.id;
      root.position.set(model.position[0], model.position[2], model.position[1]);
      root.rotation.set(0, model.rotation[2] ?? 0, 0);
      root.scale.set(model.scale[0], model.scale[1], model.scale[2]);
      root.traverse((object) => {
        object.userData.destructibleModelId = model.id;
        if (object instanceof THREE.Mesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
      this.scene.add(root);
      this.registeredModelPreviewRoots.push(root);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  writeRegisteredModelFromRoot(model: GroundfireDestructibleModel, root: THREE.Object3D): void {
    model.position = [root.position.x, root.position.z, root.position.y];
    model.rotation = [0, 0, root.rotation.y];
    model.scale = [root.scale.x, root.scale.y, root.scale.z];
  }

  async duplicateSelectedModels(): Promise<void> {
    const selected = Array.from(this.selectedModelIds)
        .map((id) => this.destructibleModels.find((model) => model.data.id === id))
        .filter((model): model is EditorDestructibleModel => Boolean(model));
    if (selected.length === 0) {
      this.setStatus('Select a registered model first');
      return;
    }

    this.selectedModelIds.clear();
    for (const source of selected) {
      const cloneId = `${source.data.id}-copy-${crypto.randomUUID().slice(0, 6)}`;
      const cloneData = this.cloneDestructibleModel(source.data, cloneId);
      cloneData.position = [
        this.snapToGrid(source.data.position[0] + EDITOR_GRID_SIZE * 4),
        source.data.position[1],
        source.data.position[2],
      ];
      cloneData.chunks = cloneData.chunks.map((chunk) => ({
        ...chunk,
        id: chunk.id.replace(source.data.id, cloneId),
      }));
      this.destructibleModels.push({
        data: cloneData,
        sourceBytes: new Uint8Array(source.sourceBytes),
        assetName: source.assetName,
      });
      await this.addRegisteredModelPreview(cloneData, source.sourceBytes);
      this.selectedModelIds.add(cloneData.id);
    }

    this.syncRegisteredModelSelectionMaterials();
    this.setStatus(`Duplicated ${selected.length} model${selected.length === 1 ? '' : 's'}`);
  }

  cloneDestructibleModel(model: GroundfireDestructibleModel, id: string): GroundfireDestructibleModel {
    return {
      ...model,
      id,
      name: `${model.name} copy`,
      position: [...model.position],
      rotation: [...model.rotation],
      scale: [...model.scale],
      destructible: {...model.destructible},
      collision: {...model.collision},
      render: {...model.render},
      chunking: {
        ...model.chunking,
        blockSize: [...model.chunking.blockSize],
        minBlockSize: [...model.chunking.minBlockSize],
      },
      chunks: model.chunks.map((chunk) => ({...chunk})),
    };
  }

  setImportedModelAsTerrain(): void {
    if (!this.importedModelRoot || this.importedModelParts.size === 0) {
      this.setStatus('Load a terrain model first');
      return;
    }

    const terrainMeshes = Array.from(this.importedModelParts.values()).map((part) => part.mesh);
    if (terrainMeshes.length === 0) {
      this.setStatus('Terrain model has no mesh parts');
      return;
    }

    this.importedModelRoot.updateMatrixWorld(true);
    terrainMeshes.forEach((mesh) => mesh.updateMatrixWorld(true));
    const bounds = new THREE.Box3().setFromObject(this.importedModelRoot);
    const rayStartY = bounds.max.y + Math.max(200, bounds.getSize(new THREE.Vector3()).y + 20);
    const rayDistance = Math.max(400, bounds.getSize(new THREE.Vector3()).y + 400);
    const terrainRaycaster = new THREE.Raycaster(
        new THREE.Vector3(0, rayStartY, 0),
        new THREE.Vector3(0, -1, 0),
        0,
        rayDistance,
    );
    const positions = this.terrainGeometry.attributes.position;
    let sampled = 0;
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const z = positions.getZ(index);
      terrainRaycaster.ray.origin.set(x, rayStartY, z);
      const [hit] = terrainRaycaster.intersectObjects(terrainMeshes, false);
      if (!hit) {
        continue;
      }
      positions.setY(index, hit.point.y);
      sampled += 1;
    }

    if (sampled === 0) {
      this.setStatus('Terrain model did not overlap the editor terrain grid');
      return;
    }

    positions.needsUpdate = true;
    this.terrainGeometry.computeVertexNormals();
    this.updateTerrainHeatmap();
    this.refreshWaterPreview();
    this.clearImportedModel();
    this.setStatus(`Terrain generated from model - ${sampled} samples`);
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
    const side = TERRAIN_SEGMENTS + 1;
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

  intersectImportedModelParts(): THREE.Intersection | null {
    const meshes = Array.from(this.importedModelParts.values()).map((part) => part.mesh);
    const [hit] = this.raycaster.intersectObjects(meshes, false);
    return hit ?? null;
  }

  intersectRegisteredModels(): THREE.Intersection | null {
    const [hit] = this.raycaster.intersectObjects(this.registeredModelPreviewRoots, true);
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
    this.selectedModelIds.clear();
    this.clearImportedModelSelection();
    this.selectedIds = new Set([id]);
    this.syncSelectionMaterials();
    this.syncRegisteredModelSelectionMaterials();
    this.syncWaterSelectionMaterials();
    this.renderWaterList();
  }

  clearSelection(): void {
    this.selectedWaterId = null;
    this.selectedModelIds.clear();
    this.clearElementSelection();
    this.clearImportedModelSelection();
    this.syncRegisteredModelSelectionMaterials();
    this.syncWaterSelectionMaterials();
    this.renderWaterList();
  }

  clearElementSelection(): void {
    this.selectedIds.clear();
    this.syncSelectionMaterials();
  }

  clearImportedModelSelection(): void {
    if (this.selectedImportedPartIds.size === 0) {
      return;
    }

    this.selectedImportedPartIds.clear();
    this.syncImportedModelSelectionMaterials();
    this.renderImportedModelParts();
  }

  registeredModelIdFromObject(object: THREE.Object3D | null): string | null {
    let current: THREE.Object3D | null = object;
    while (current) {
      if (typeof current.userData.destructibleModelId === 'string') {
        return current.userData.destructibleModelId;
      }
      current = current.parent;
    }

    return null;
  }

  registeredModelPreviewRoot(modelId: string): THREE.Group | null {
    return this.registeredModelPreviewRoots.find((root) => root.userData.destructibleModelId === modelId) ?? null;
  }

  toggleRegisteredModelSelection(modelId: string, append: boolean): void {
    if (!append) {
      this.selectedIds.clear();
      this.selectedImportedPartIds.clear();
      this.selectedModelIds.clear();
    }
    if (append && this.selectedModelIds.has(modelId)) {
      this.selectedModelIds.delete(modelId);
    } else {
      this.selectedModelIds.add(modelId);
    }

    this.selectedWaterId = null;
    this.syncImportedModelSelectionMaterials();
    this.renderImportedModelParts();
    this.syncSelectionMaterials();
    this.syncRegisteredModelSelectionMaterials();
    this.syncWaterSelectionMaterials();
    this.renderWaterList();
    this.setStatus(`Selected ${this.selectedModelIds.size} model${this.selectedModelIds.size === 1 ? '' : 's'}`);
  }

  syncRegisteredModelSelectionMaterials(): void {
    this.registeredModelPreviewRoots.forEach((root) => {
      const selected = this.selectedModelIds.has(root.userData.destructibleModelId);
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) {
          return;
        }
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
          if (material instanceof THREE.MeshStandardMaterial) {
            material.emissive.set(selected ? 0x385000 : 0x000000);
            material.emissiveIntensity = selected ? 0.55 : 0;
            material.needsUpdate = true;
          }
        });
      });
    });
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
      this.applyTerrainSurfaceColors();
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

  applyTerrainSurfaceColors(): void {
    const positions = this.terrainGeometry.attributes.position;
    const baseColor = new THREE.Color(this.terrainMaterialColor(this.terrainMaterialInput.value || 'grassy-meadow'));
    if (this.surfacePatches.length === 0) {
      this.terrainGeometry.deleteAttribute('color');
      this.terrainMaterial.vertexColors = false;
      this.terrainMaterial.color.copy(baseColor);
      this.terrainMaterial.needsUpdate = true;
      return;
    }

    const colors = new Float32Array(positions.count * 3);
    const patchColor = new THREE.Color();
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const z = positions.getZ(index);
      const color = baseColor.clone();
      this.surfacePatches.forEach((patch) => {
        const blend = this.surfacePatchBlendAt(patch, x, z);
        if (blend <= 0) {
          return;
        }
        patchColor.set(this.terrainMaterialColor(patch.material));
        color.lerp(patchColor, blend);
      });
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }

    this.terrainGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.terrainMaterial.vertexColors = true;
    this.terrainMaterial.color.set(0xffffff);
    this.terrainMaterial.needsUpdate = true;
  }

  surfacePatchBlendAt(patch: GroundfireTerrainSurfacePatch, x: number, z: number): number {
    if (patch.shape === 'rect' && patch.size) {
      const rotation = -(patch.rotation ?? 0);
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const dx = x - patch.center[0];
      const dz = z - patch.center[1];
      const localX = dx * cos - dz * sin;
      const localZ = dx * sin + dz * cos;
      if (Math.abs(localX) > patch.size[0] / 2 || Math.abs(localZ) > patch.size[1] / 2) {
        return 0;
      }
      return THREE.MathUtils.clamp(patch.opacity ?? 0.96, 0, 1);
    }

    const distance = Math.hypot(x - patch.center[0], z - patch.center[1]);
    if (distance > patch.radius) {
      return 0;
    }
    const falloff = Math.cos((distance / patch.radius) * Math.PI * 0.5);
    return THREE.MathUtils.clamp((patch.opacity ?? 0.85) * falloff, 0, 1);
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
    this.disposeMaterial(mesh.material);
  }

  disposeObject(object: THREE.Object3D): void {
    this.scene.remove(object);
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        this.disposeMaterial(child.material);
      }
    });
  }

  disposeMaterial(material: THREE.Material | THREE.Material[]): void {
    if (Array.isArray(material)) {
      material.forEach((item) => item.dispose());
      return;
    }

    material.dispose();
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
          textureSet: this.terrainMaterialInput.value || 'grassy-meadow',
        },
        features: [],
        surfacePatches: this.surfacePatches,
      },
      environment: this.environmentFromInputs(),
      materials: {
        terrain: this.terrainMaterialInput.value || 'grassy-meadow',
        wall: 'brick-wall',
        building: 'concrete-building',
        obstacle: 'steel-obstacle',
        water: 'water-clear',
      },
      elements: Array.from(this.elements.values()).map((element) => element.data),
      groups: this.groups,
      destructibleModels: this.destructibleModels.map((model) => model.data),
      water: this.waterSources,
      spawns: this.defaultSpawns(),
    };
  }

  async exportPackage(): Promise<void> {
    const id = this.safeMapId();
    if (this.importedModelRoot && this.importedModelSourceExtension === 'glb' && this.importedModelSourceBytes) {
      await this.registerImportedModelAsDestructible();
    }
    const heightmapBlob = await this.heightmapBlob();
    const modelAssetEntries = Array.from(
        this.destructibleModels.reduce((entries, model) => (
            entries.has(model.assetName) ? entries : entries.set(model.assetName, model.sourceBytes)
        ), new Map<string, Uint8Array>()),
    ).map(([name, bytes]) => ({name, bytes}));
    const zipEntries = [
      {
        name: 'map.json',
        bytes: new TextEncoder().encode(JSON.stringify(this.createMapDefinition('heightmap.png'), null, 2)),
      },
      {
        name: 'heightmap.png',
        bytes: new Uint8Array(await heightmapBlob.arrayBuffer()),
      },
      ...modelAssetEntries,
    ];
    const zip = createStoredZip(zipEntries);
    this.downloadBlob(`${id}.zip`, new Blob([this.uint8BlobPart(zip)], {type: 'application/zip'}), 'application/zip');
    const heightStats = this.heightStats();
    const heightRange = heightStats.max - heightStats.min;
    this.setStatus(
        heightRange > 0.05
            ? `Exported ${id}.zip - terrain ${heightStats.min.toFixed(1)} to ${heightStats.max.toFixed(1)}`
            : `Exported ${id}.zip - terrain is flat`,
    );
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
    for (let row = 0; row < HEIGHTMAP_RESOLUTION; row += 1) {
      for (let column = 0; column < HEIGHTMAP_RESOLUTION; column += 1) {
        const u = HEIGHTMAP_RESOLUTION > 1 ? column / (HEIGHTMAP_RESOLUTION - 1) : 0;
        const v = HEIGHTMAP_RESOLUTION > 1 ? row / (HEIGHTMAP_RESOLUTION - 1) : 0;
        const x = THREE.MathUtils.lerp(-this.terrainSize / 2, this.terrainSize / 2, u);
        const z = THREE.MathUtils.lerp(-this.terrainSize / 2, this.terrainSize / 2, v);
        const pixelIndex = (row * HEIGHTMAP_RESOLUTION + column) * 4;
        const value = Math.round(((this.heightAt(x, z) - stats.min) / range) * 255);
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
