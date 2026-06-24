import * as THREE from 'three';
import type {WebGPURenderer} from 'three/webgpu';

type RendererBackend = THREE.WebGLRenderer | WebGPURenderer;

export class Renderer {
  renderer: RendererBackend;
  backend: 'webgl' | 'webgpu';

  private constructor(renderer: RendererBackend, backend: 'webgl' | 'webgpu') {
    this.renderer = renderer;
    this.backend = backend;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
  }

  static async create(preferWebGpu: boolean): Promise<Renderer> {
    if (preferWebGpu && typeof navigator !== 'undefined' && 'gpu' in navigator) {
      try {
        const {WebGPURenderer} = await import('three/webgpu');
        const renderer = new WebGPURenderer({antialias: true});
        await renderer.init();
        return new Renderer(renderer, 'webgpu');
      } catch (error) {
        console.warn('WebGPU renderer unavailable, falling back to WebGL', error);
      }
    }

    return new Renderer(new THREE.WebGLRenderer({antialias: true}), 'webgl');
  }
}
