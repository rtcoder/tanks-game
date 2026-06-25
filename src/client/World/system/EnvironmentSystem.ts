import * as THREE from 'three';
import {ENVIRONMENT_PRESETS, environmentPresetDefinition} from '../../../shared/environment';
import type {GroundfireEnvironment} from '../../../shared/types';
import type {SkyDome} from '../object/impl/Light/SkyDome';
import type {DirectionalLight} from '../object/impl/Light/DirectionalLight';
import type {HemiSphereLight} from '../object/impl/Light/HemiSphereLight';
import type {Renderer} from './Renderer';
import type {Scene} from './Scene';

type WeatherParticleMode = 'none' | 'rain' | 'snow' | 'dust';

const PARTICLE_COUNT = 160;
const PARTICLE_AREA = 820;
const PARTICLE_HEIGHT = 520;
const ATMOSPHERE_UPDATE_INTERVAL = 0.16;
const PARTICLE_UPDATE_INTERVAL = 1 / 12;
const AMBIENCE_UPDATE_INTERVAL = 0.5;
const WEATHER_PARTICLE_QUALITY = 0.55;

export class EnvironmentSystem {
  readonly particles = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({size: 2, transparent: true, opacity: 0, depthWrite: false}),
  );
  private readonly particlePositions = new Float32Array(PARTICLE_COUNT * 3);
  private readonly particleFallFactors = new Float32Array(PARTICLE_COUNT);
  private readonly particleRespawnX = new Float32Array(PARTICLE_COUNT);
  private readonly particleRespawnY = new Float32Array(PARTICLE_COUNT);
  private readonly particleRespawnZ = new Float32Array(PARTICLE_COUNT);
  private readonly windVector = new THREE.Vector3();
  private readonly skyTopColor = new THREE.Color();
  private readonly skyHorizonColor = new THREE.Color();
  private readonly skyGroundColor = new THREE.Color();
  private readonly fogColor = new THREE.Color();
  private readonly flashColor = new THREE.Color();
  private readonly sunDirectionVector = new THREE.Vector3();
  private readonly particleCenter = new THREE.Vector3();
  private elapsed = 0;
  private atmosphereElapsed = ATMOSPHERE_UPDATE_INTERVAL;
  private particleElapsed = 0;
  private ambienceElapsed = AMBIENCE_UPDATE_INTERVAL;
  private smoothedFrameTime = 1 / 60;
  private weatherQuality = WEATHER_PARTICLE_QUALITY;
  private currentTimeOfDay = 12;
  private currentParticleMode: WeatherParticleMode = 'none';
  private ambience: THREE.Audio[] = [];
  private lightningFlash = 0;

  constructor(
      private readonly scene: Scene,
      private readonly skyDome: SkyDome,
      private readonly hemiLight: HemiSphereLight,
      private readonly directLight: DirectionalLight,
      private readonly renderer: Renderer,
      private environment: GroundfireEnvironment,
      listeners: THREE.AudioListener[],
  ) {
    this.currentTimeOfDay = environment.timeOfDay;
    this.seedParticles();
    this.particles.name = 'environment:weather-particles';
    this.particles.frustumCulled = false;
    this.scene.scene.add(this.particles);
    this.ambience = listeners.map((listener) => this.createAmbience(listener));
    this.applyEnvironment(true);
  }

  setEnvironment(environment: GroundfireEnvironment): void {
    this.environment = environment;
    this.currentTimeOfDay = environment.timeOfDay;
    this.applyEnvironment(true);
  }

  gameplay(): GroundfireEnvironment['gameplay'] {
    return this.environment.gameplay;
  }

  wind(): THREE.Vector3 {
    return this.windVector.clone();
  }

  windInto(target: THREE.Vector3): THREE.Vector3 {
    return target.copy(this.windVector);
  }

  visibilityMultiplier(): number {
    return this.environment.gameplay.visibilityMultiplier;
  }

  snowCoverage(): number {
    if (this.environment.preset !== 'snow') {
      return 0;
    }
    return THREE.MathUtils.lerp(0.35, 1, this.environment.weather.intensity);
  }

  tick(delta: number, focus?: THREE.Vector3): void {
    this.elapsed += delta;
    this.smoothedFrameTime = THREE.MathUtils.lerp(this.smoothedFrameTime, delta, 0.08);
    this.weatherQuality = this.smoothedFrameTime > 0.04
      ? 0
      : this.smoothedFrameTime > 0.029
        ? 0.25
        : WEATHER_PARTICLE_QUALITY;
    this.atmosphereElapsed += delta;
    this.particleElapsed += delta;
    this.ambienceElapsed += delta;
    if (this.environment.cycle.enabled) {
      const hoursPerSecond = 24 / Math.max(1, this.environment.cycle.minutesPerDay * 60);
      this.currentTimeOfDay = (this.currentTimeOfDay + delta * hoursPerSecond) % 24;
    }

    this.updateLightning(delta);
    if (this.shouldRefreshAtmosphere()) {
      this.applyEnvironment(false);
      this.atmosphereElapsed = 0;
    }
    if (this.particleElapsed >= PARTICLE_UPDATE_INTERVAL) {
      this.updateParticles(Math.min(this.particleElapsed, PARTICLE_UPDATE_INTERVAL * 3), focus);
      this.particleElapsed = 0;
    }
    if (this.ambienceElapsed >= AMBIENCE_UPDATE_INTERVAL) {
      this.updateAmbience();
      this.ambienceElapsed = 0;
    }
  }

  private applyEnvironment(force: boolean): void {
    const preset = environmentPresetDefinition(this.environment.preset);
    const daylight = this.daylightFactor();
    const intensity = this.environment.weather.intensity;
    const flash = this.lightningFlash;
    const skyTop = this.skyTopColor.set(preset.sky.top).lerp(this.flashColor.set(0x071123), 1 - daylight);
    const skyHorizon = this.skyHorizonColor.set(preset.sky.horizon).lerp(this.flashColor.set(0x16233b), (1 - daylight) * 0.72);
    const skyGround = this.skyGroundColor.set(preset.sky.ground);
    const fogColor = this.fogColor.set(preset.fog.color).lerp(this.flashColor.set(0xd6e8ff), flash * 0.45);
    const sun = preset.sun;
    const sunDirection = this.sunDirection(sun.azimuth, this.environment.cycle.enabled ? this.timeElevation() : sun.elevation);
    const fogNear = preset.fog.near * (1 - intensity * 0.22);
    const fogFar = preset.fog.far * (1 - intensity * 0.18);
    const exposure = preset.exposure + flash * 0.45;

    this.skyDome.setColors(skyTop, skyHorizon, skyGround);
    this.setBackground(skyTop, skyHorizon);
    this.setFog(fogColor, Math.max(120, fogNear), Math.max(fogNear + 400, fogFar));
    this.hemiLight.mesh.color.set(preset.hemi.sky).lerp(this.flashColor.set(0xd6e8ff), flash * 0.25);
    this.hemiLight.mesh.groundColor.set(preset.hemi.ground);
    this.hemiLight.mesh.intensity = preset.hemi.intensity * (0.45 + daylight * 0.75) + flash * 1.1;
    this.directLight.mesh.color.set(sun.color).lerp(this.flashColor.set(0xeaf4ff), flash * 0.7);
    this.directLight.mesh.intensity = sun.intensity * (0.2 + daylight * 0.9) + flash * 4.8;
    this.directLight.mesh.position.copy(sunDirection).multiplyScalar(760);
    this.renderer.renderer.toneMappingExposure = exposure;

    const windRadians = THREE.MathUtils.degToRad(this.environment.weather.windDirection);
    this.windVector.set(
        Math.cos(windRadians) * this.environment.weather.windStrength,
        Math.sin(windRadians) * this.environment.weather.windStrength,
        0,
    );

    if (force || this.currentParticleMode !== preset.particles) {
      this.setParticleMode(preset.particles);
    }
  }

  private daylightFactor(): number {
    const angle = ((this.currentTimeOfDay - 6) / 24) * Math.PI * 2;
    return THREE.MathUtils.clamp(Math.sin(angle) * 0.5 + 0.55, 0.08, 1);
  }

  private timeElevation(): number {
    const angle = ((this.currentTimeOfDay - 6) / 24) * Math.PI * 2;
    return THREE.MathUtils.lerp(-12, 68, THREE.MathUtils.clamp(Math.sin(angle) * 0.5 + 0.5, 0, 1));
  }

  private sunDirection(azimuthDegrees: number, elevationDegrees: number): THREE.Vector3 {
    const azimuth = THREE.MathUtils.degToRad(azimuthDegrees);
    const elevation = THREE.MathUtils.degToRad(elevationDegrees);
    return this.sunDirectionVector.set(
        Math.cos(azimuth) * Math.cos(elevation),
        Math.sin(azimuth) * Math.cos(elevation),
        Math.sin(elevation),
    ).normalize();
  }

  private shouldRefreshAtmosphere(): boolean {
    if (this.environment.cycle.enabled) {
      return this.atmosphereElapsed >= ATMOSPHERE_UPDATE_INTERVAL * 0.5;
    }
    return this.atmosphereElapsed >= ATMOSPHERE_UPDATE_INTERVAL;
  }

  private setBackground(top: THREE.Color, horizon: THREE.Color): void {
    if (!(this.scene.scene.background instanceof THREE.Color)) {
      this.scene.scene.background = new THREE.Color();
    }
    this.scene.scene.background.copy(top).lerp(horizon, 0.45);
  }

  private setFog(color: THREE.Color, near: number, far: number): void {
    if (!(this.scene.scene.fog instanceof THREE.Fog)) {
      this.scene.scene.fog = new THREE.Fog(color, near, far);
      return;
    }
    this.scene.scene.fog.color.copy(color);
    this.scene.scene.fog.near = near;
    this.scene.scene.fog.far = far;
  }

  private setParticleMode(mode: WeatherParticleMode): void {
    this.currentParticleMode = mode;
    this.particles.visible = mode !== 'none' && this.weatherQuality > 0;
    const material = this.particles.material as THREE.PointsMaterial;
    material.color.set(mode === 'rain' ? 0x9fb8d4 : mode === 'snow' ? 0xffffff : 0xd9b16d);
    material.size = mode === 'rain' ? 1.55 : mode === 'snow' ? 2.4 : 2.8;
    material.opacity = mode === 'none' ? 0 : THREE.MathUtils.lerp(0.08, 0.34, this.environment.weather.intensity);
    material.needsUpdate = true;
    this.updateParticleDrawRange();
  }

  private seedParticles(): void {
    for (let index = 0; index < PARTICLE_COUNT; index += 1) {
      const offset = index * 3;
      const seed = this.hash01(index, 1);
      this.particlePositions[offset] = (seed - 0.5) * PARTICLE_AREA;
      this.particlePositions[offset + 1] = (this.hash01(index, 2) - 0.5) * PARTICLE_AREA;
      this.particlePositions[offset + 2] = this.hash01(index, 3) * PARTICLE_HEIGHT + 20;
      this.particleFallFactors[index] = 0.45 + this.hash01(index, 4);
      this.particleRespawnX[index] = this.hash01(index, 5) - 0.5;
      this.particleRespawnY[index] = this.hash01(index, 6) - 0.5;
      this.particleRespawnZ[index] = 0.55 + this.hash01(index, 7) * 0.45;
    }
    this.particles.geometry.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));
  }

  private updateParticles(delta: number, focus?: THREE.Vector3): void {
    if (this.currentParticleMode === 'none') {
      return;
    }
    this.updateParticleDrawRange();
    if (!this.particles.visible) {
      return;
    }

    const speed = this.currentParticleMode === 'rain'
      ? 760
      : this.currentParticleMode === 'snow'
        ? 80
        : 120;
    const driftScale = this.currentParticleMode === 'dust' ? 240 : 160;
    const driftX = this.windVector.x * driftScale;
    const driftY = this.windVector.y * driftScale;
    const center = focus ?? this.particleCenter.set(0, 0, 0);
    for (let index = 0; index < PARTICLE_COUNT; index += 1) {
      const offset = index * 3;
      this.particlePositions[offset] += driftX * delta;
      this.particlePositions[offset + 1] += driftY * delta;
      this.particlePositions[offset + 2] -= speed * delta * this.particleFallFactors[index];
      if (this.particlePositions[offset + 2] < 4) {
        this.particlePositions[offset] = center.x + this.particleRespawnX[index] * PARTICLE_AREA;
        this.particlePositions[offset + 1] = center.y + this.particleRespawnY[index] * PARTICLE_AREA;
        this.particlePositions[offset + 2] = center.z + PARTICLE_HEIGHT * this.particleRespawnZ[index];
      }
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
  }

  private updateLightning(delta: number): void {
    this.lightningFlash = Math.max(0, this.lightningFlash - delta * 2.6);
    if (this.environment.preset !== 'storm') {
      return;
    }
    const pulse = Math.sin(this.elapsed * 0.51) + Math.sin(this.elapsed * 1.37);
    if (pulse > 1.86 && this.lightningFlash <= 0.02) {
      this.lightningFlash = 1;
    }
  }

  private updateParticleDrawRange(): void {
    const presetBudget = this.currentParticleMode === 'rain'
      ? 0.7
      : this.currentParticleMode === 'snow'
        ? 0.55
        : 0.4;
    const count = Math.floor(PARTICLE_COUNT * presetBudget * this.weatherQuality);
    this.particles.visible = this.currentParticleMode !== 'none' && count > 0;
    this.particles.geometry.setDrawRange(0, count);
  }

  private createAmbience(listener: THREE.AudioListener): THREE.Audio {
    const sound = new THREE.Audio(listener);
    const context = listener.context;
    const seconds = 2;
    const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      const noise = this.hash01(index, 11) * 2 - 1;
      data[index] = noise * 0.14 + Math.sin(index * 0.013) * 0.03;
    }
    sound.setBuffer(buffer);
    sound.setLoop(true);
    sound.setVolume(0);
    try {
      sound.play();
    } catch {
      // Browsers may block procedural ambience until a user gesture.
    }
    return sound;
  }

  private updateAmbience(): void {
    const preset = ENVIRONMENT_PRESETS[this.environment.preset];
    const volume = preset.ambience === 'none'
      ? 0
      : THREE.MathUtils.lerp(0.015, preset.ambience === 'storm' ? 0.09 : 0.055, this.environment.weather.intensity);
    this.ambience.forEach((sound) => {
      sound.setVolume(volume);
      if (!sound.isPlaying && volume > 0) {
        try {
          sound.play();
        } catch {
          // Audio playback is best-effort; visuals and gameplay must keep running.
        }
      }
    });
  }

  private hash01(index: number, salt: number): number {
    let hash = 2166136261 ^ salt;
    hash ^= index + 0x9e3779b9 + (hash << 6) + (hash >> 2);
    hash = Math.imul(hash, 16777619);
    return ((hash >>> 0) % 10000) / 10000;
  }
}
