import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { manifoldToGeometry } from './meshConvert.js';
import type { BuildResult } from '../store.js';
import type { MeshData } from 'manifold-3d';

export type ExportFormat = 'stl' | 'glb' | '3mf';

export interface ExportedFile {
  name: string;
  blob: Blob;
  ext: string;
}

export async function exportResults(results: BuildResult[], format: ExportFormat): Promise<ExportedFile[]> {
  if (!results.length) throw new Error('Nothing to export.');
  const fmt = format.toLowerCase() as ExportFormat;

  if (fmt === '3mf') {
    const blob = await build3MF(results);
    return [{ name: results.length === 1 ? results[0].name : 'bundle', blob, ext: '3mf' }];
  }

  const files: ExportedFile[] = [];
  for (const r of results) {
    const geom = manifoldToGeometry(r.manifold);
    const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial());
    if (fmt === 'stl') {
      const data = new STLExporter().parse(mesh, { binary: true }) as DataView;
      const u8 = new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
      files.push({ name: r.name, blob: new Blob([u8 as BlobPart], { type: 'model/stl' }), ext: 'stl' });
    } else if (fmt === 'glb') {
      const data = await new Promise<ArrayBuffer>((resolve, reject) => {
        new GLTFExporter().parse(mesh, res => resolve(res as ArrayBuffer), reject, { binary: true });
      });
      files.push({ name: r.name, blob: new Blob([data], { type: 'model/gltf-binary' }), ext: 'glb' });
    } else {
      throw new Error(`Unknown format: ${format}`);
    }
  }
  return files;
}

async function build3MF(results: BuildResult[]): Promise<Blob> {
  const objects = results.map((r, i) => objectXml(i + 1, r.name, r.manifold.getMesh()));
  const buildItems = results.map((_, i) => `<item objectid="${i + 1}"/>`).join('');
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>${objects.join('')}</resources>
  <build>${buildItems}</build>
</model>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;
  return zip([
    { path: '[Content_Types].xml', data: contentTypes },
    { path: '_rels/.rels', data: rels },
    { path: '3D/3dmodel.model', data: model },
  ]);
}

function objectXml(id: number, name: string, mesh: MeshData): string {
  const stride = mesh.numProp;
  const v = mesh.vertProperties;
  const t = mesh.triVerts;
  const verts: string[] = [];
  for (let i = 0; i < v.length; i += stride) {
    verts.push(`<vertex x="${v[i]}" y="${v[i + 1]}" z="${v[i + 2]}"/>`);
  }
  const tris: string[] = [];
  for (let i = 0; i < t.length; i += 3) {
    tris.push(`<triangle v1="${t[i]}" v2="${t[i + 1]}" v3="${t[i + 2]}"/>`);
  }
  return `<object id="${id}" name="${escapeXml(name)}" type="model"><mesh><vertices>${verts.join('')}</vertices><triangles>${tris.join('')}</triangles></mesh></object>`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!));
}

interface ZipEntry { path: string; data: string | Uint8Array; }

async function zip(entries: ZipEntry[]): Promise<Blob> {
  const enc = new TextEncoder();
  const fileRecords: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const e of entries) {
    const nameBytes = enc.encode(e.path);
    const dataBytes = typeof e.data === 'string' ? enc.encode(e.data) : e.data;
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(localHeader.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(8, 0, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, size, true);
    dv.setUint32(22, size, true);
    dv.setUint16(26, nameBytes.length, true);
    localHeader.set(nameBytes, 30);
    fileRecords.push(localHeader, dataBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    central.push(centralHeader);

    offset += localHeader.length + dataBytes.length;
  }

  const centralSize = central.reduce((a, b) => a + b.length, 0);
  const centralOffset = offset;

  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralOffset, true);

  const parts: BlobPart[] = [
    ...fileRecords.map(b => b as BlobPart),
    ...central.map(b => b as BlobPart),
    end as BlobPart,
  ];
  return new Blob(parts, { type: 'model/3mf' });
}

let crcTable: Uint32Array | null = null;
function crc32(buf: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[i] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function downloadFiles(files: ExportedFile[]): void {
  for (const f of files) {
    const url = URL.createObjectURL(f.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitize(f.name)}.${f.ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function sanitize(name: string): string {
  return name.replace(/[^a-z0-9._-]+/gi, '_') || 'export';
}
