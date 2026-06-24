# Groundfire Agent Notes

## Performance Direction

- When it has a positive impact on performance, use WebAssembly for heavy deterministic computation such as model import, mesh segmentation, voxelization, terrain/water preprocessing, collision-grid generation, structural support graphs, and other CPU-heavy editor/runtime jobs.
- When appropriate, use WebGPU for GPU-friendly workloads such as large-scale rendering, instancing, GPU culling, terrain/heightmap processing, water preview, particles, and compute-heavy visual systems.
- WebGPU must not be the only path unless the project explicitly drops fallback support. Prefer a WebGPU path with a WebAssembly or WebGL/Three.js fallback so the game remains usable on browsers without reliable WebGPU support.
- Profile or reason from a concrete bottleneck before adding a lower-level technology. Avoid moving ordinary UI, small object orchestration, or frequent tiny JS-to-WASM calls into WebAssembly.

## Map Model Import Direction

- Imported city/island/map models should be treated as source assets, not as one giant gameplay collision mesh.
- Prefer pre-fractured GLB chunks from Blender or another DCC tool for complex destructible map models. Each meaningful chunk should be a separate mesh/node so the editor and runtime can assign health, collision, ownership, and destruction state per chunk.
- Keep visual reference geometry separate from gameplay metadata. The map package should preserve the original GLB asset and store Groundfire metadata for destructible chunks, collision mode, health, and grouping.
- Prefer GLB as the runtime contract because it can package model geometry and textures together. glTF/OBJ can be accepted as editor import/reference formats, but should not be required at runtime.
- Use generated Groundfire blocks only as a fallback or helper workflow when a model is not already authored into useful chunks.
- Destruction should use support/attachment rules: chunks or blocks without enough support from terrain or neighboring/lower chunks should fall or break independently.
