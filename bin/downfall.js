#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const core = require('../src/core.js');
const { liberateDocx } = require('../src/docx.js');

const HELP = `
  downfall — the Downfall of RTL, command line edition  (v${core.VERSION})

  Usage:
    downfall [options] <files...>      liberate files (dry run by default)
    cat file | downfall -              liberate stdin, print to stdout

  Supported: .md .markdown .html .htm .css .scss .txt .json .xml .svg .docx

  Options:
    -w, --write        actually overwrite the files (otherwise: dry run)
    -o, --out <dir>    write liberated copies into <dir> instead
    --comic-sans       also replace Persian fonts (Vazirmatn & friends) with Comic Sans
    -q, --quiet        no victory speeches
    -h, --help         this

  What it does:
    dir="rtl" / dir="auto"      -> dir="ltr"
    direction: rtl              -> direction: ltr   (CSS, inline styles, Obsidian front matter)
    text-align: right           -> text-align: left
    unicode-bidi: plaintext     -> unicode-bidi: normal
    RLM RLE RLO RLI ALM         -> LRM LRE LRO LRI LRM
    .docx <w:bidi/> <w:rtl/>    -> deleted
`;

const TEXT_EXT = new Set(['.md', '.markdown', '.html', '.htm', '.css', '.scss', '.less', '.txt', '.json', '.xml', '.svg', '.vue', '.jsx', '.tsx']);
const SPEECHES = [
  'Another one bites the dust.',
  'Left is right. Right is wrong.',
  'The text has been returned to its natural habitat.',
  'Gravity pulls left. It always has.',
  'This file will now be read the way ASCII intended.',
];

function parseArgs(argv) {
  const o = { files: [], write: false, out: null, comic: false, quiet: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-w' || a === '--write') o.write = true;
    else if (a === '-o' || a === '--out') o.out = argv[++i];
    else if (a === '--comic-sans') o.comic = true;
    else if (a === '-q' || a === '--quiet') o.quiet = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else o.files.push(a);
  }
  return o;
}

function liberateText(text, opts) {
  const out = core.rewriteMarkup(text, { fontReplacement: opts.comic ? core.COMIC_SANS : null });
  return { out, changed: out !== text };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || opts.files.length === 0) {
    process.stdout.write(HELP);
    process.exit(opts.help ? 0 : 1);
  }

  if (opts.files.length === 1 && opts.files[0] === '-') {
    const input = fs.readFileSync(0, 'utf8');
    process.stdout.write(liberateText(input, opts).out);
    return;
  }

  let liberated = 0;
  let failed = 0;
  for (const file of opts.files) {
    const ext = path.extname(file).toLowerCase();
    try {
      let result, changed, note;
      if (ext === '.docx') {
        const r = liberateDocx(fs.readFileSync(file));
        result = r.buffer;
        changed = r.count > 0;
        note = `${r.count} RTL tag(s) removed`;
      } else if (TEXT_EXT.has(ext)) {
        const text = fs.readFileSync(file, 'utf8');
        const r = liberateText(text, opts);
        result = r.out;
        changed = r.changed;
        note = 'rewritten';
      } else {
        if (!opts.quiet) console.log(`  skip   ${file}  (unknown type; it may remain RTL, for now)`);
        continue;
      }

      if (!changed) {
        if (!opts.quiet) console.log(`  clean  ${file}  (already LTR, a model citizen)`);
        continue;
      }
      liberated++;
      if (opts.out) {
        fs.mkdirSync(opts.out, { recursive: true });
        const dest = path.join(opts.out, path.basename(file));
        fs.writeFileSync(dest, result);
        if (!opts.quiet) console.log(`  freed  ${file} -> ${dest}  (${note})`);
      } else if (opts.write) {
        fs.writeFileSync(file, result);
        if (!opts.quiet) console.log(`  freed  ${file}  (${note})`);
      } else if (!opts.quiet) {
        console.log(`  would  ${file}  (${note}; pass --write to commit to the cause)`);
      }
    } catch (err) {
      failed++;
      console.error(`  fail   ${file}: ${err.message}`);
    }
  }

  if (!opts.quiet && liberated) {
    console.log(`\n  ${liberated} file(s) liberated. ${SPEECHES[liberated % SPEECHES.length]}`);
  }
  process.exit(failed ? 1 : 0);
}

main();
