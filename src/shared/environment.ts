import {GroundfireEnvironment, GroundfireEnvironmentPreset} from './types';

export type SkyEnvironment = {
  top: number;
  horizon: number;
  ground: number;
};

export type FogEnvironment = {
  color: number;
  near: number;
  far: number;
};

export type HemisphereEnvironment = {
  sky: number;
  ground: number;
  intensity: number;
};

export type SunEnvironment = {
  color: number;
  intensity: number;
  azimuth: number;
  elevation: number;
}

export type WeatherEnvironment = {
  sky: SkyEnvironment;
  fog: FogEnvironment;
  hemi: HemisphereEnvironment;
  sun: SunEnvironment;
}

export enum ParticleType {
  None = 'none',
  Rain = 'rain',
  Snow = 'snow',
  Dust = 'dust',
}

export enum Ambience {
  None = 'none',
  Rain = 'rain',
  Storm = 'storm',
  Wind = 'wind',
}

export type GroundfireEnvironmentPresetDefinition = GroundfireEnvironment & WeatherEnvironment & {
  label: string;
  exposure: number;
  particles: ParticleType;
  ambience: Ambience;
};

export const ENVIRONMENT_PRESET_ORDER: GroundfireEnvironmentPreset[] = [
  GroundfireEnvironmentPreset.Clear,
  GroundfireEnvironmentPreset.Overcast,
  GroundfireEnvironmentPreset.Foggy,
  GroundfireEnvironmentPreset.GoldenHour,
  GroundfireEnvironmentPreset.Night,
  GroundfireEnvironmentPreset.Rain,
  GroundfireEnvironmentPreset.Storm,
  GroundfireEnvironmentPreset.Snow,
  GroundfireEnvironmentPreset.Dust,
];

export const ENVIRONMENT_PRESETS: Record<GroundfireEnvironmentPreset, GroundfireEnvironmentPresetDefinition> = {
  clear: {
    label: 'Clear',
    preset: GroundfireEnvironmentPreset.Clear,
    timeOfDay: 13,
    cycle: {enabled: false, minutesPerDay: 18},
    weather: {intensity: 0, windDirection: 35, windStrength: 0.05},
    gameplay: {tractionMultiplier: 1, projectileDrift: 0, visibilityMultiplier: 1, radarNoise: 0},
    sky: {top: 0x6f9ed8, horizon: 0xd7c08a, ground: 0x202616},
    fog: {color: 0xd7c08a, near: 5200, far: 9200},
    hemi: {sky: 0xb9d9ff, ground: 0x5d6244, intensity: 1.1},
    sun: {color: 0xfff1c4, intensity: 2.6, azimuth: 220, elevation: 48},
    exposure: 1.08,
    particles: ParticleType.None,
    ambience: Ambience.None,
  },
  overcast: {
    label: 'Overcast',
    preset: GroundfireEnvironmentPreset.Overcast,
    timeOfDay: 14,
    cycle: {enabled: false, minutesPerDay: 22},
    weather: {intensity: 0.35, windDirection: 80, windStrength: 0.22},
    gameplay: {tractionMultiplier: 0.95, projectileDrift: 0.02, visibilityMultiplier: 0.82, radarNoise: 0.08},
    sky: {top: 0x778596, horizon: 0xb4ad95, ground: 0x252a22},
    fog: {color: 0xaead9e, near: 2400, far: 6200},
    hemi: {sky: 0xb8c3cf, ground: 0x4a4f43, intensity: 0.9},
    sun: {color: 0xe8dfc7, intensity: 1.1, azimuth: 210, elevation: 38},
    exposure: 0.98,
    particles: ParticleType.None,
    ambience: Ambience.Wind,
  },
  foggy: {
    label: 'Foggy',
    preset: GroundfireEnvironmentPreset.Foggy,
    timeOfDay: 8,
    cycle: {enabled: false, minutesPerDay: 24},
    weather: {intensity: 0.58, windDirection: 20, windStrength: 0.04},
    gameplay: {tractionMultiplier: 0.92, projectileDrift: 0.01, visibilityMultiplier: 0.45, radarNoise: 0.26},
    sky: {top: 0xa8b6bf, horizon: 0xc9c5ae, ground: 0x3b4239},
    fog: {color: 0xc4c2ad, near: 420, far: 2600},
    hemi: {sky: 0xc8d3d8, ground: 0x6a6b5e, intensity: 1.2},
    sun: {color: 0xf0dec0, intensity: 0.7, azimuth: 135, elevation: 22},
    exposure: 1.02,
    particles: ParticleType.Dust,
    ambience: Ambience.Wind,
  },
  'golden-hour': {
    label: 'Golden hour',
    preset: GroundfireEnvironmentPreset.GoldenHour,
    timeOfDay: 18.4,
    cycle: {enabled: false, minutesPerDay: 18},
    weather: {intensity: 0.1, windDirection: 260, windStrength: 0.12},
    gameplay: {tractionMultiplier: 1, projectileDrift: 0.01, visibilityMultiplier: 0.9, radarNoise: 0.06},
    sky: {top: 0x5c7ab8, horizon: 0xffb35f, ground: 0x29210f},
    fog: {color: 0xffb56d, near: 3600, far: 8200},
    hemi: {sky: 0xb8c8ff, ground: 0x6a4b25, intensity: 1.0},
    sun: {color: 0xffc06a, intensity: 3.4, azimuth: 255, elevation: 13},
    exposure: 1.12,
    particles: ParticleType.None,
    ambience: Ambience.Wind,
  },
  night: {
    label: 'Night',
    preset: GroundfireEnvironmentPreset.Night,
    timeOfDay: 23,
    cycle: {enabled: false, minutesPerDay: 30},
    weather: {intensity: 0.16, windDirection: 300, windStrength: 0.1},
    gameplay: {tractionMultiplier: 0.96, projectileDrift: 0.01, visibilityMultiplier: 0.38, radarNoise: 0.34},
    sky: {top: 0x071123, horizon: 0x16233b, ground: 0x050807},
    fog: {color: 0x16233b, near: 1200, far: 5200},
    hemi: {sky: 0x385078, ground: 0x11170f, intensity: 0.48},
    sun: {color: 0xb8ccff, intensity: 0.72, azimuth: 35, elevation: 36},
    exposure: 0.72,
    particles: ParticleType.None,
    ambience: Ambience.Wind,
  },
  rain: {
    label: 'Rain',
    preset: GroundfireEnvironmentPreset.Rain,
    timeOfDay: 15,
    cycle: {enabled: false, minutesPerDay: 20},
    weather: {intensity: 0.68, windDirection: 115, windStrength: 0.38},
    gameplay: {tractionMultiplier: 0.84, projectileDrift: 0.04, visibilityMultiplier: 0.62, radarNoise: 0.18},
    sky: {top: 0x4d6072, horizon: 0x89908b, ground: 0x1c211b},
    fog: {color: 0x858f8d, near: 1200, far: 4300},
    hemi: {sky: 0x93a5b6, ground: 0x343b32, intensity: 0.88},
    sun: {color: 0xd7d0bb, intensity: 0.85, azimuth: 205, elevation: 34},
    exposure: 0.88,
    particles: ParticleType.Rain,
    ambience: Ambience.Rain,
  },
  storm: {
    label: 'Storm',
    preset: GroundfireEnvironmentPreset.Storm,
    timeOfDay: 16,
    cycle: {enabled: false, minutesPerDay: 20},
    weather: {intensity: 0.9, windDirection: 150, windStrength: 0.7},
    gameplay: {tractionMultiplier: 0.78, projectileDrift: 0.08, visibilityMultiplier: 0.46, radarNoise: 0.46},
    sky: {top: 0x202b3a, horizon: 0x5f625d, ground: 0x10130f},
    fog: {color: 0x545b61, near: 760, far: 3400},
    hemi: {sky: 0x6e7e91, ground: 0x232820, intensity: 0.72},
    sun: {color: 0xc6c8d2, intensity: 0.62, azimuth: 190, elevation: 30},
    exposure: 0.82,
    particles: ParticleType.Rain,
    ambience: Ambience.Storm,
  },
  snow: {
    label: 'Snow',
    preset: GroundfireEnvironmentPreset.Snow,
    timeOfDay: 11,
    cycle: {enabled: false, minutesPerDay: 24},
    weather: {intensity: 0.72, windDirection: 25, windStrength: 0.32},
    gameplay: {tractionMultiplier: 0.76, projectileDrift: 0.035, visibilityMultiplier: 0.72, radarNoise: 0.12},
    sky: {top: 0xc1d5e7, horizon: 0xe9e4d0, ground: 0x73807a},
    fog: {color: 0xd9dfdd, near: 1500, far: 5200},
    hemi: {sky: 0xe8f4ff, ground: 0xa5ada3, intensity: 1.35},
    sun: {color: 0xffffff, intensity: 1.45, azimuth: 210, elevation: 32},
    exposure: 1.16,
    particles: ParticleType.Snow,
    ambience: Ambience.Wind,
  },
  dust: {
    label: 'Dust',
    preset: GroundfireEnvironmentPreset.Dust,
    timeOfDay: 16.5,
    cycle: {enabled: false, minutesPerDay: 18},
    weather: {intensity: 0.82, windDirection: 280, windStrength: 0.78},
    gameplay: {tractionMultiplier: 0.82, projectileDrift: 0.12, visibilityMultiplier: 0.42, radarNoise: 0.38},
    sky: {top: 0xb08c62, horizon: 0xd6a35f, ground: 0x433019},
    fog: {color: 0xc89658, near: 520, far: 2800},
    hemi: {sky: 0xd7b178, ground: 0x5b4022, intensity: 1.05},
    sun: {color: 0xffb35f, intensity: 2.0, azimuth: 260, elevation: 25},
    exposure: 1.04,
    particles: ParticleType.Dust,
    ambience: Ambience.Wind,
  },
};

export const DEFAULT_ENVIRONMENT: GroundfireEnvironment = {
  preset: GroundfireEnvironmentPreset.Clear,
  timeOfDay: ENVIRONMENT_PRESETS.clear.timeOfDay,
  cycle: {...ENVIRONMENT_PRESETS.clear.cycle},
  weather: {...ENVIRONMENT_PRESETS.clear.weather},
  gameplay: {...ENVIRONMENT_PRESETS.clear.gameplay},
};

export function environmentPresetDefinition(preset: GroundfireEnvironmentPreset): GroundfireEnvironmentPresetDefinition {
  return ENVIRONMENT_PRESETS[preset] ?? ENVIRONMENT_PRESETS.clear;
}
