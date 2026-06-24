# Groundfire Agent Notes

## Performance Direction

- When it has a positive impact on performance, use WebAssembly for heavy deterministic computation such as model import, mesh segmentation, voxelization, terrain/water preprocessing, collision-grid generation, structural support graphs, and other CPU-heavy editor/runtime jobs.
- When appropriate, use WebGPU for GPU-friendly workloads such as large-scale rendering, instancing, GPU culling, terrain/heightmap processing, water preview, particles, and compute-heavy visual systems.
- WebGPU must not be the only path unless the project explicitly drops fallback support. Prefer a WebGPU path with a WebAssembly or WebGL/Three.js fallback so the game remains usable on browsers without reliable WebGPU support.
- Profile or reason from a concrete bottleneck before adding a lower-level technology. Avoid moving ordinary UI, small object orchestration, or frequent tiny JS-to-WASM calls into WebAssembly.

## Map Model Import Direction

- Imported city/island/map models should be treated as source assets, not as one giant gameplay collision mesh.
- Keep visual reference geometry separate from gameplay data. Generate Groundfire map elements, collision proxies, destructible blocks, and metadata from the source model.
- Prefer GLB/glTF as the long-term model format. OBJ can be accepted as an editor import format, but should not become the runtime contract.
- For destructible structures, split geometry into block grids. Stagger every other vertical level so upper blocks overlap lower blocks, instead of making one removable vertical column.
- Destruction should use support/attachment rules: blocks without enough support from terrain or neighboring/lower blocks should fall or break independently.
