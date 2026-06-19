import * as THREE from 'three';
import {BaseObject} from '../../BaseObject.ts';

export class SkyDome extends BaseObject {
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
