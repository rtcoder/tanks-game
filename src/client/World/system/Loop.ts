import {Camera} from './Camera/Camera';
import {Renderer} from './Renderer';
import {Scene} from './Scene';

export class Loop {
  scene: Scene;
  cameras: Camera[];
  renderers: Renderer[];
  lastFrameTime = 0;
  /// list of lists of updateables
  updatableLists: any[];

  constructor(scene: Scene, cameras: Camera[], renderers: Renderer[]) {
    this.scene = scene;
    this.cameras = cameras;
    this.renderers = renderers;
    this.updatableLists = [];
  }

  start() {
    this.lastFrameTime = performance.now();
    for (let i = 0; i < this.cameras.length; i++) {
      const camera = this.cameras[i];
      const renderer = this.renderers[i];
      renderer.renderer.setAnimationLoop(() => {
        this.tick();
        renderer.renderer.render(this.scene.scene, camera.camera);
      });
    }
  }

  tick() {
    const now = performance.now();
    const delta = Math.min((now - this.lastFrameTime) / 1000, 0.05);
    this.lastFrameTime = now;
    this.updatableLists.forEach((updatableList) => {
      updatableList.forEach((updatable: { tick: (delta: number) => void }) => updatable.tick(delta));
    });
  }

  stop() {
    this.renderers.forEach(renderer => renderer.renderer.setAnimationLoop(null));
  }
}
