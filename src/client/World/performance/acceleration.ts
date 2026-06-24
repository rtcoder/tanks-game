export enum PreferredChunkBackend {
  WASM_READY = 'wasm-ready',
  WEBGPU_READY = 'webgpu-ready',
  TYPESCRIPT_GRID = 'typescript-grid',
}
export type RuntimeAccelerationProfile = {
  webgpu: boolean;
  wasm: boolean;
  preferredChunkBackend: PreferredChunkBackend;
};

export function detectRuntimeAcceleration(): RuntimeAccelerationProfile {
  const webgpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
  const wasm = typeof WebAssembly === 'object';
  return {
    webgpu,
    wasm,
    preferredChunkBackend: webgpu
        ? PreferredChunkBackend.WEBGPU_READY
        : (wasm
            ? PreferredChunkBackend.WASM_READY
            : PreferredChunkBackend.TYPESCRIPT_GRID
        ),
  };
}
