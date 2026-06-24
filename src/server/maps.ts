import fs from 'fs/promises';
import path from 'path';
import {fileURLToPath} from 'url';
import {normalizeGroundfireMap} from '../shared/map-normalizer.ts';
import type {GroundfireMap, GroundfireMapSummary} from '../shared/types.ts';
import {readStoredZipEntries} from '../shared/zip.ts';
import {sanitizeMapId} from './sanitize.ts';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const mapsDir = path.resolve(dirname, '..', 'assets', 'maps');

type MapFileLike = {
  id?: unknown;
  name?: unknown;
  version?: unknown;
  arena?: {
    size?: unknown;
  };
};

export async function listMaps(): Promise<GroundfireMapSummary[]> {
  const files = await fs.readdir(mapsDir);
  const mapIds = files
    .filter((file) => file.endsWith('.zip'))
    .map((file) => path.basename(file, '.zip'));

  const summaries = await Promise.all(
    mapIds
      .map(async (id) => {
        try {
          const map = await readMapFile(id);
          return summarizeMap(id, map);
        } catch (error) {
          console.warn(`Could not load map "${id}"`, error);
          return null;
        }
      }),
  );

  return summaries
    .filter((summary): summary is GroundfireMapSummary => Boolean(summary))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getMap(mapId: unknown): Promise<unknown | null> {
  const id = sanitizeMapId(mapId);
  try {
    return {
      ...normalizeGroundfireMap(await readMapFile(id), id),
      id,
    };
  } catch {
    return null;
  }
}

export async function getMapAsset(
  mapId: unknown,
  assetName: unknown,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  const id = sanitizeMapId(mapId);
  if (typeof assetName !== 'string') {
    return null;
  }

  const decodedAssetName = safeDecodeURIComponent(assetName);
  if (decodedAssetName === null) {
    return null;
  }

  const normalizedAssetName = normalizePackageAssetName(decodedAssetName);
  if (!isSafePackageAssetName(normalizedAssetName)) {
    return null;
  }

  try {
    return await readMapPackageAsset(id, normalizedAssetName);
  } catch {
    return null;
  }
}

async function readMapFile(id: string): Promise<unknown> {
  const zipPath = path.resolve(mapsDir, `${sanitizeMapId(id)}.zip`);
  return readMapPackage(id, zipPath);
}

async function readMapPackage(id: string, filePath: string): Promise<unknown> {
  if (!filePath.startsWith(mapsDir)) {
    throw new Error('Invalid map package path');
  }

  const entries = readStoredZipEntries(await fs.readFile(filePath));
  const mapEntry = entries.get('map.json');
  if (!mapEntry) {
    throw new Error('Map package does not contain map.json');
  }

  const map = JSON.parse(new TextDecoder().decode(mapEntry)) as {
    terrain?: {
      heightmapAsset?: unknown;
    };
  };
  const heightmapEntry = findPackageAsset(entries, map.terrain?.heightmapAsset, 'heightmap.png');
  if (heightmapEntry) {
    map.terrain = map.terrain ?? {};
    map.terrain.heightmapAsset = `/api/maps/${sanitizeMapId(id)}/assets/${path.basename(heightmapEntry)}`;
  }
  return map;
}

async function readMapPackageAsset(
    id: string,
    assetName: string,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  const zipPath = path.resolve(mapsDir, `${sanitizeMapId(id)}.zip`);
  const entries = readStoredZipEntries(await fs.readFile(zipPath));
  const entryName = findPackageAsset(entries, assetName);
  if (!entryName) {
    return null;
  }

  const bytes = entries.get(entryName);
  if (!bytes) {
    return null;
  }

  return {
    bytes: Buffer.from(bytes),
    contentType: contentTypeFor(entryName),
  };
}

function findPackageAsset(entries: Map<string, Uint8Array>, assetName: unknown, fallbackName?: string): string | null {
  const candidates = new Set<string>();
  if (typeof assetName === 'string' && assetName.trim()) {
    const normalized = normalizePackageAssetName(assetName);
    candidates.add(normalized);
    candidates.add(path.basename(normalized));
  }
  if (fallbackName) {
    candidates.add(fallbackName);
  }

  for (const candidate of candidates) {
    if (entries.has(candidate)) {
      return candidate;
    }
  }

  for (const entryName of entries.keys()) {
    if (fallbackName && path.basename(entryName) === fallbackName) {
      return entryName;
    }
    if (typeof assetName === 'string' && path.basename(entryName) === path.basename(assetName)) {
      return entryName;
    }
  }

  return null;
}

function normalizePackageAssetName(assetName: string): string {
  return assetName
    .replace(/\\/g, '/')
    .replace(/^\/api\/maps\/[^/]+\/assets\//, '')
    .replace(/^\/+/, '')
    .replace(/^\.\//, '');
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function isSafePackageAssetName(assetName: string): boolean {
  if (!assetName || assetName.length > 220 || assetName.endsWith('/')) {
    return false;
  }
  if (assetName.includes('\\') || assetName.includes('\0')) {
    return false;
  }
  return assetName
    .split('/')
    .every((segment) => segment && segment !== '.' && segment !== '..');
}

function summarizeMap(id: string, map: unknown): GroundfireMapSummary {
  const mapFile = map as MapFileLike;
  return {
    id,
    name: typeof mapFile.name === 'string' ? mapFile.name : id,
    version: typeof mapFile.version === 'number' ? mapFile.version : 1,
    arenaSize: Number(mapFile.arena?.size) || 1500,
  };
}

export function isGroundfireMap(map: unknown): map is GroundfireMap {
  return Boolean(map && typeof map === 'object' && (map as {version?: unknown}).version === 2);
}

function contentTypeFor(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.glb':
      return 'model/gltf-binary';
    case '.gltf':
      return 'model/gltf+json';
    case '.obj':
      return 'text/plain; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}
