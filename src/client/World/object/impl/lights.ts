import * as THREE from 'three';
import {BaseObject} from '../BaseObject';

class HemiSphereLight extends BaseObject {
  mesh: THREE.HemisphereLight;

  constructor(name: string) {
    super('hemi-sphere-light', name);
    const light = new THREE.HemisphereLight(0xb9d9ff, 0x5d6244, 1.1);
    this.mesh = light;
  }
}

class DirectionalLight extends BaseObject {
  mesh: THREE.DirectionalLight;

  constructor(name: string) {
    super('directional-light', name);
    const light = new THREE.DirectionalLight(0xfff1c4, 2.6);
    light.position.set(-260, -180, 420);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.top = 900;
    light.shadow.camera.bottom = -900;
    light.shadow.camera.left = -900;
    light.shadow.camera.right = 900;
    light.shadow.camera.near = 50;
    light.shadow.camera.far = 1200;
    light.shadow.bias = -0.00025;
    this.mesh = light;
  }
}

class SkyDome extends BaseObject {
  mesh: THREE.Mesh;

  constructor(name: string) {
    super('sky-dome', name);
    this.mesh = new THREE.Mesh(
        new THREE.SphereGeometry(4200, 48, 24),
        new THREE.ShaderMaterial({
          side: THREE.BackSide,
          depthWrite: false,
          uniforms: {
            topColor: {value: new THREE.Color(0x6f9ed8)},
            horizonColor: {value: new THREE.Color(0xd7c08a)},
            groundColor: {value: new THREE.Color(0x202616)},
            offset: {value: 0.12},
            exponent: {value: 0.82},
          },
          vertexShader: `
            varying vec3 vWorldPosition;
            void main() {
              vec4 worldPosition = modelMatrix * vec4(position, 1.0);
              vWorldPosition = worldPosition.xyz;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            uniform vec3 topColor;
            uniform vec3 horizonColor;
            uniform vec3 groundColor;
            uniform float offset;
            uniform float exponent;
            varying vec3 vWorldPosition;
            void main() {
              float h = normalize(vWorldPosition + vec3(0.0, 0.0, offset)).z;
              float skyMix = max(pow(max(h, 0.0), exponent), 0.0);
              vec3 sky = mix(horizonColor, topColor, skyMix);
              vec3 color = h < 0.0 ? mix(horizonColor, groundColor, min(abs(h) * 2.0, 1.0)) : sky;
              gl_FragColor = vec4(color, 1.0);
            }
          `,
        }),
    );
    this.mesh.frustumCulled = false;
  }
}

export {HemiSphereLight, DirectionalLight, SkyDome};
