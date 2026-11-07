'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { crc32, readZip, writeZip, liberateWordXml, liberateDocx } = require('../src/docx.js');

const DOC = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:pPr><w:bidi/><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:rtl/></w:rPr><w:t>سلام</w:t></w:r></w:p>
<w:tbl><w:tblPr><w:bidiVisual/></w:tblPr></w:tbl>
<w:sectPr><w:rtlGutter/></w:sectPr>
<w:p><w:pPr><w:bidi w:val="0"/></w:pPr></w:p>
</w:body></w:document>`;

test('crc32 matches zlib', () => {
  const b = Buffer.from('left to right, as nature intended');
  if (zlib.crc32) assert.equal(crc32(b), zlib.crc32(b));
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
});

test('liberateWordXml cuts out every RTL tag', () => {
  const { xml, count } = liberateWordXml(DOC);
  assert.equal(count, 5);
  assert.ok(!/<w:(bidi|rtl|bidiVisual|rtlGutter)\/>/.test(xml));
  assert.ok(xml.includes('<w:jc w:val="left"/>'));
  assert.ok(xml.includes('<w:bidi w:val="0"/>'), 'already-LTR markers are left alone');
  assert.ok(xml.includes('سلام'), 'the words survive, only the direction dies');
});

test('docx round trip through our zip writer/reader', () => {
  const files = [
    { name: '[Content_Types].xml', data: Buffer.from('<Types/>') },
    { name: 'word/document.xml', data: Buffer.from(DOC) },
    { name: 'word/media/tiny.bin', data: Buffer.from([1, 2, 3]) },
  ];
  const { buffer, count } = liberateDocx(writeZip(files));
  assert.equal(count, 5);
  const back = readZip(buffer);
  assert.deepEqual(back.map((e) => e.name), files.map((f) => f.name));
  assert.ok(!back[1].data.toString().includes('<w:rtl/>'));
  assert.deepEqual([...back[2].data], [1, 2, 3]);
});

test('system unzip agrees our zips are zips', (t) => {
  const { execFileSync } = require('node:child_process');
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  try { execFileSync('unzip', ['-v'], { stdio: 'ignore' }); } catch { return t.skip('no unzip'); }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'downfall-'));
  const f = path.join(dir, 'x.docx');
  fs.writeFileSync(f, writeZip([{ name: 'word/document.xml', data: Buffer.from(DOC) }]));
  const out = execFileSync('unzip', ['-t', f]).toString();
  assert.match(out, /No errors detected/);
  fs.rmSync(dir, { recursive: true });
});
