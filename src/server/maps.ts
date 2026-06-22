import fs from 'fs/promises';
import path from 'path';
import {fileURLToPath} from 'url';
import {normalizeGroundfireMap} from '../shared/map-normalizer.ts';
import type {GroundfireMap, GroundfireMapSummary} from '../shared/types.ts';
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
  const summaries = await Promise.all(
    files
      .filter((file) => file.endsWith('.json'))
      .map(async (file) => {
        const id = path.basename(file, '.json');
        const map = await readMapFile(id);
        return summarizeMap(id, map);
      }),
  );

  return summaries.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getMap(mapId: unknown): Promise<unknown | null> {
  const id = sanitizeMapId(mapId);
  try {
    return normalizeGroundfireMap(await readMapFile(id), id);
  } catch {
    return null;
  }
}

export async function getMapAsset(
  mapId: unknown,
  assetName: unknown,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  const id = sanitizeMapId(mapId);
  if (typeof assetName !== 'string' || !/^[a-z0-9][a-z0-9_.-]{0,120}$/i.test(assetName)) {
    return null;
  }

  const mapAssetDir = path.resolve(mapsDir, id);
  const assetPath = path.resolve(mapAssetDir, assetName);
  if (!assetPath.startsWith(`${mapAssetDir}${path.sep}`)) {
    return null;
  }

  try {
    return {
      bytes: await fs.readFile(assetPath),
      contentType: contentTypeFor(assetPath),
    };
  } catch {
    return null;
  }
}

async function readMapFile(id: string): Promise<unknown> {
  const filePath = path.resolve(mapsDir, `${sanitizeMapId(id)}.json`);
  if (!filePath.startsWith(mapsDir)) {
    throw new Error('Invalid map path');
  }

  return JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown;
}

function summarizeMap(id: string, map: unknown): GroundfireMapSummary {
  const mapFile = map as MapFileLike;
  return {
    id: typeof mapFile.id === 'string' ? mapFile.id : id,
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
    default:
      return 'application/octet-stream';
  }
}
