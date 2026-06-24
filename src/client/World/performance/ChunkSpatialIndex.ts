import * as THREE from 'three';

export class ChunkSpatialIndex {
  private readonly cellSize: number;
  private readonly cells = new Map<string, Set<string>>();
  private readonly chunkCells = new Map<string, string[]>();

  constructor(cellSize = 120) {
    this.cellSize = Math.max(1, cellSize);
  }

  clear(): void {
    this.cells.clear();
    this.chunkCells.clear();
  }

  insert(id: string, box: THREE.Box3): void {
    this.remove(id);
    if (box.isEmpty()) {
      return;
    }

    const keys = this.keysForBox(box);
    this.chunkCells.set(id, keys);
    keys.forEach((key) => {
      const cell = this.cells.get(key) ?? new Set<string>();
      cell.add(id);
      this.cells.set(key, cell);
    });
  }

  remove(id: string): void {
    const keys = this.chunkCells.get(id);
    if (!keys) {
      return;
    }

    keys.forEach((key) => {
      const cell = this.cells.get(key);
      if (!cell) {
        return;
      }
      cell.delete(id);
      if (cell.size === 0) {
        this.cells.delete(key);
      }
    });
    this.chunkCells.delete(id);
  }

  queryPoint(point: THREE.Vector3): string[] {
    return Array.from(this.cells.get(this.keyForPoint(point)) ?? []);
  }

  queryBox(box: THREE.Box3): string[] {
    const ids = new Set<string>();
    this.keysForBox(box).forEach((key) => {
      this.cells.get(key)?.forEach((id) => ids.add(id));
    });
    return Array.from(ids);
  }

  private keysForBox(box: THREE.Box3): string[] {
    const minX = Math.floor(box.min.x / this.cellSize);
    const maxX = Math.floor(box.max.x / this.cellSize);
    const minY = Math.floor(box.min.y / this.cellSize);
    const maxY = Math.floor(box.max.y / this.cellSize);
    const minZ = Math.floor(box.min.z / this.cellSize);
    const maxZ = Math.floor(box.max.z / this.cellSize);
    const keys: string[] = [];

    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        for (let z = minZ; z <= maxZ; z += 1) {
          keys.push(`${x}:${y}:${z}`);
        }
      }
    }

    return keys;
  }

  private keyForPoint(point: THREE.Vector3): string {
    return [
      Math.floor(point.x / this.cellSize),
      Math.floor(point.y / this.cellSize),
      Math.floor(point.z / this.cellSize),
    ].join(':');
  }
}
