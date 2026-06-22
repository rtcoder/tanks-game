export type ZipEntry = {
  name: string;
  bytes: Uint8Array;
};

const LOCAL_FILE_HEADER = 0x04034b50;
const CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const UTF8_FILE_NAME_FLAG = 0x0800;
const STORE_METHOD = 0;

let crcTable: Uint32Array | null = null;

export function createStoredZip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  entries.forEach((entry) => {
    const name = normalizeZipEntryName(entry.name);
    const fileName = encoder.encode(name);
    const data = entry.bytes;
    const checksum = crc32(data);

    const localHeader = new Uint8Array(30 + fileName.length);
    const localView = new DataView(localHeader.buffer);
    writeUint32(localView, 0, LOCAL_FILE_HEADER);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, UTF8_FILE_NAME_FLAG);
    writeUint16(localView, 8, STORE_METHOD);
    writeUint16(localView, 10, 0);
    writeUint16(localView, 12, 0);
    writeUint32(localView, 14, checksum);
    writeUint32(localView, 18, data.length);
    writeUint32(localView, 22, data.length);
    writeUint16(localView, 26, fileName.length);
    writeUint16(localView, 28, 0);
    localHeader.set(fileName, 30);

    const centralHeader = new Uint8Array(46 + fileName.length);
    const centralView = new DataView(centralHeader.buffer);
    writeUint32(centralView, 0, CENTRAL_DIRECTORY_HEADER);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, UTF8_FILE_NAME_FLAG);
    writeUint16(centralView, 10, STORE_METHOD);
    writeUint16(centralView, 12, 0);
    writeUint16(centralView, 14, 0);
    writeUint32(centralView, 16, checksum);
    writeUint32(centralView, 20, data.length);
    writeUint32(centralView, 24, data.length);
    writeUint16(centralView, 28, fileName.length);
    writeUint16(centralView, 30, 0);
    writeUint16(centralView, 32, 0);
    writeUint16(centralView, 34, 0);
    writeUint16(centralView, 36, 0);
    writeUint32(centralView, 38, 0);
    writeUint32(centralView, 42, offset);
    centralHeader.set(fileName, 46);

    localParts.push(localHeader, data);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  });

  const centralDirectorySize = centralParts.reduce((total, part) => total + part.length, 0);
  const centralDirectoryOffset = offset;
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  writeUint32(endView, 0, END_OF_CENTRAL_DIRECTORY);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, entries.length);
  writeUint16(endView, 10, entries.length);
  writeUint32(endView, 12, centralDirectorySize);
  writeUint32(endView, 16, centralDirectoryOffset);
  writeUint16(endView, 20, 0);

  return concatUint8Arrays([...localParts, ...centralParts, endRecord]);
}

export function readStoredZipEntries(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = findEndOfCentralDirectory(view);
  if (endOffset < 0) {
    throw new Error('ZIP central directory not found');
  }

  const entryCount = readUint16(view, endOffset + 10);
  const centralDirectoryOffset = readUint32(view, endOffset + 16);
  const decoder = new TextDecoder();
  const entries = new Map<string, Uint8Array>();
  let cursor = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(view, cursor) !== CENTRAL_DIRECTORY_HEADER) {
      throw new Error('Invalid ZIP central directory entry');
    }

    const compressionMethod = readUint16(view, cursor + 10);
    const compressedSize = readUint32(view, cursor + 20);
    const uncompressedSize = readUint32(view, cursor + 24);
    const fileNameLength = readUint16(view, cursor + 28);
    const extraLength = readUint16(view, cursor + 30);
    const commentLength = readUint16(view, cursor + 32);
    const localHeaderOffset = readUint32(view, cursor + 42);
    const rawName = bytes.slice(cursor + 46, cursor + 46 + fileNameLength);
    const name = normalizeZipEntryName(decoder.decode(rawName));
    cursor += 46 + fileNameLength + extraLength + commentLength;

    if (!name || name.endsWith('/')) {
      continue;
    }
    if (compressionMethod !== STORE_METHOD) {
      throw new Error(`Unsupported ZIP compression method ${compressionMethod} for ${name}`);
    }
    if (compressedSize !== uncompressedSize) {
      throw new Error(`Compressed ZIP entry is not supported: ${name}`);
    }
    if (readUint32(view, localHeaderOffset) !== LOCAL_FILE_HEADER) {
      throw new Error(`Invalid ZIP local header for ${name}`);
    }

    const localNameLength = readUint16(view, localHeaderOffset + 26);
    const localExtraLength = readUint16(view, localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    entries.set(name, bytes.slice(dataOffset, dataOffset + uncompressedSize));
  }

  return entries;
}

export function normalizeZipEntryName(name: string): string {
  const normalized = name.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^\.\//, '');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.some((part) => part === '..')) {
    throw new Error(`Invalid ZIP entry name: ${name}`);
  }
  return parts.join('/');
}

function findEndOfCentralDirectory(view: DataView): number {
  const minimumSize = 22;
  for (let offset = view.byteLength - minimumSize; offset >= 0; offset -= 1) {
    if (readUint32(view, offset) === END_OF_CENTRAL_DIRECTORY) {
      return offset;
    }
  }
  return -1;
}

function crc32(bytes: Uint8Array): number {
  const table = crcTable ?? createCrcTable();
  crcTable = table;
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = table[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

function concatUint8Arrays(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

function readUint16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function writeUint16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true);
}
