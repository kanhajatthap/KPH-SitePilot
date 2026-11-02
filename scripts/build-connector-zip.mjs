#!/usr/bin/env node
/**
 * Pure Node.js WordPress Connector ZIP packager.
 *
 * Runs anywhere Node 20+ exists (local dev, GitHub Actions, Vercel build
 * containers without the `zip` CLI). Produces a standards-compliant PKZIP
 * archive with a single top-level `kph-sitepilot-connector/` folder, excluding
 * tests and dotfiles, and writes both:
 *   - dist/kph-sitepilot-connector-<version>.zip
 *   - apps/dashboard/public/downloads/kph-sitepilot-connector.zip
 *   - apps/dashboard/public/downloads/kph-sitepilot-connector-<version>.zip
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PLUGIN_DIR = path.join(ROOT, 'wordpress', 'kph-sitepilot-connector');
const MAIN_FILE = path.join(PLUGIN_DIR, 'kph-sitepilot-connector.php');

if (!fs.existsSync(MAIN_FILE)) {
  console.error(`build-connector-zip: missing ${MAIN_FILE}`);
  process.exit(1);
}

const mainSource = fs.readFileSync(MAIN_FILE, 'utf8');
const headerMatch = mainSource.match(/^\s*\*\s*Version:\s*([^\r\n]+)/m);
const constMatch = mainSource.match(/define\(\s*'KPH_SP_VERSION',\s*'([^']+)'\s*\)/);

const version = headerMatch ? headerMatch[1].trim() : '';
const constVersion = constMatch ? constMatch[1].trim() : '';

if (!version) {
  console.error('build-connector-zip: could not read Version from plugin header');
  process.exit(1);
}
if (version !== constVersion) {
  console.error(`build-connector-zip: header version (${version}) != KPH_SP_VERSION (${constVersion})`);
  process.exit(1);
}

const EXCLUDED_DIRS = new Set(['tests', 'node_modules']);

function collectFiles(dir, relPrefix = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const results = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name) || relPath === 'assets/src') continue;
      results.push(...collectFiles(fullPath, relPath));
    } else if (entry.isFile()) {
      if (entry.name.endsWith('.map') || entry.name.endsWith('.md')) continue;
      results.push({ zipPath: `kph-sitepilot-connector/${relPath}`, fullPath });
    }
  }

  return results;
}

// Precompute standard IEEE 802.3 CRC-32 table
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c >>> 0;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZipBuffer(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  // Fixed DOS timestamp (2026-11-02 00:00:00) for deterministic builds
  const dosTime = 0x0000;
  const dosDate = ((2026 - 1980) << 9) | (11 << 5) | 2;

  for (const item of files) {
    const raw = fs.readFileSync(item.fullPath);
    const compressed = zlib.deflateRawSync(raw, { level: 9 });
    const useDeflate = compressed.length < raw.length;
    const payload = useDeflate ? compressed : raw;
    const method = useDeflate ? 8 : 0;
    const sum = crc32(raw);
    const nameBuf = Buffer.from(item.zipPath, 'utf8');

    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
    localHeader.writeUInt16LE(20, 4); // Version needed (2.0)
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(sum, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(raw.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // Extra length
    nameBuf.copy(localHeader, 30);

    const centralHeader = Buffer.alloc(46 + nameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Central directory signature
    centralHeader.writeUInt16LE(0x031e, 4); // Version made by (Unix, 3.0)
    centralHeader.writeUInt16LE(20, 6); // Version needed
    centralHeader.writeUInt16LE(0x0800, 8); // UTF-8 flag
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(sum, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(raw.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // Extra length
    centralHeader.writeUInt16LE(0, 32); // Comment length
    centralHeader.writeUInt16LE(0, 34); // Disk start
    centralHeader.writeUInt16LE(0, 36); // Internal attrs
    centralHeader.writeUInt32LE((0o100644 << 16) >>> 0, 38); // External attrs (-rw-r--r--)
    centralHeader.writeUInt32LE(offset, 42);
    nameBuf.copy(centralHeader, 46);

    localParts.push(localHeader, payload);
    centralParts.push(centralHeader);
    offset += localHeader.length + payload.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, eocd]);
}

const files = collectFiles(PLUGIN_DIR);
if (!files.some((f) => f.zipPath === 'kph-sitepilot-connector/kph-sitepilot-connector.php')) {
  console.error('build-connector-zip: missing kph-sitepilot-connector.php in collected files');
  process.exit(1);
}

const zipBuffer = buildZipBuffer(files);

const distDir = path.join(ROOT, 'dist');
const publicDownloadsDir = path.join(ROOT, 'apps', 'dashboard', 'public', 'downloads');
fs.mkdirSync(distDir, { recursive: true });
fs.mkdirSync(publicDownloadsDir, { recursive: true });

const targets = [
  path.join(distDir, `kph-sitepilot-connector-${version}.zip`),
  path.join(publicDownloadsDir, `kph-sitepilot-connector-${version}.zip`),
  path.join(publicDownloadsDir, 'kph-sitepilot-connector.zip'),
];

for (const target of targets) {
  fs.writeFileSync(target, zipBuffer);
}

// Write safe public metadata JSON so UI components always know the exact version/size
fs.writeFileSync(
  path.join(publicDownloadsDir, 'connector-meta.json'),
  JSON.stringify(
    {
      version,
      filename: `kph-sitepilot-connector-${version}.zip`,
      sizeBytes: zipBuffer.length,
      fileCount: files.length,
    },
    null,
    2
  ) + '\n'
);

console.log(
  `built kph-sitepilot-connector-${version}.zip (${zipBuffer.length} bytes, ${files.length} files)`
);
