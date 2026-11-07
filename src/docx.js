'use strict';
/**
 * .docx surgery. A .docx is a zip of XML files; RTL lives in a handful of tags:
 *   <w:bidi/>        paragraph is right-to-left
 *   <w:rtl/>         run is right-to-left
 *   <w:bidiVisual/>  table is right-to-left
 *   <w:rtlGutter/>   section gutter on the right
 *   <w:jc w:val="right"/>  right-aligned paragraph
 * We cut them out. Zero dependencies: a tiny zip reader/writer lives below.
 */
const zlib = require('node:zlib');

// ---------------------------------------------------------------- CRC32 -----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ------------------------------------------------------------------ zip -----
function readZip(buf) {
  // Find End Of Central Directory (scan backwards, comment may be up to 64k).
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a zip file (is this really a .docx?)');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Corrupt central directory');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    // Local header has its own name/extra lengths.
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else throw new Error(`Unsupported zip compression method ${method} in ${name}`);
    entries.push({ name, data });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function writeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = zlib.deflateRawSync(data);
    const store = deflated.length >= data.length;
    const body = store ? data : deflated;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // utf-8 names
    local.writeUInt16LE(store ? 0 : 8, 8);
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0x21, 12); // date: 1980-01-01, the dawn of LTR
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(store ? 0 : 8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += 30 + nameBuf.length + body.length;
  }
  const cdSize = centrals.reduce((n, b) => n + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, eocd]);
}

// ------------------------------------------------------------- surgery -----
const RTL_TAGS = /<w:(?:bidi|rtl|bidiVisual|rtlGutter)(?:\s+w:val="(?:1|true|on)")?\s*\/>/g;

function liberateWordXml(xml) {
  let count = 0;
  const out = xml
    .replace(RTL_TAGS, () => { count++; return ''; })
    .replace(/<w:jc\s+w:val="right"\s*\/>/g, () => { count++; return '<w:jc w:val="left"/>'; });
  return { xml: out, count };
}

/**
 * Remove RTL from a .docx buffer.
 * @returns {{buffer: Buffer, count: number}}
 */
function liberateDocx(buf) {
  const entries = readZip(buf);
  let count = 0;
  for (const e of entries) {
    if (/^word\/.*\.xml$/.test(e.name)) {
      const r = liberateWordXml(e.data.toString('utf8'));
      if (r.count) {
        e.data = Buffer.from(r.xml, 'utf8');
        count += r.count;
      }
    }
  }
  return { buffer: writeZip(entries), count };
}

module.exports = { crc32, readZip, writeZip, liberateWordXml, liberateDocx };
