'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/core.js');

test('flips every RTL bidi control into its LTR twin', () => {
  const input = '‏سلام‫dunya‬‮x‬⁧y⁩؜';
  const out = core.flipBidiControls(input);
  assert.equal(core.countRtlControls(input), 5);
  assert.equal(core.countRtlControls(out), 0);
  assert.equal(out, '‎سلام‪dunya‬‭x‬⁦y⁩‎');
});

test('rewriteCss: direction, alignment and plaintext', () => {
  const css = '.a{direction:rtl;text-align:right}.b{direction : RTL !important; unicode-bidi: plaintext}';
  assert.equal(
    core.rewriteCss(css),
    '.a{direction:ltr;text-align:left}.b{direction : ltr !important; unicode-bidi: normal}'
  );
});

test('rewriteCss leaves non-RTL things alone', () => {
  const css = '.x{margin-right:4px;direction:ltr;font-family:Vazirmatn}';
  assert.equal(core.rewriteCss(css), css); // no fontReplacement -> fonts untouched
});

test('rewriteCss: Comic Sans replaces Persian fonts, @font-face gets deported', () => {
  const css = `@font-face{font-family:"Vazirmatn";src:url(v.woff2)}
@font-face{font-family:"Inter";src:url(i.woff2)}
body{font-family:"Vazirmatn FD", 'IRANSans', Inter, sans-serif}
p{font: 14px/1.5 Vazir, Tahoma}`;
  const out = core.rewriteCss(css, { fontReplacement: core.COMIC_SANS });
  assert.ok(!/Vazir|IRANSans/.test(out), out);
  assert.ok(out.includes('@font-face{font-family:"Inter"'), 'innocent fonts are spared');
  assert.ok(out.includes('deported'));
  assert.ok(out.includes('Comic Sans MS'));
  assert.ok(out.includes('Inter, sans-serif'));
});

test('rewriteMarkup: dir attributes in HTML, kramdown and Obsidian front matter', () => {
  assert.equal(core.rewriteMarkup('<p dir="rtl">x</p>'), '<p dir="ltr">x</p>');
  assert.equal(core.rewriteMarkup("<p dir='auto'>x</p>"), "<p dir='ltr'>x</p>");
  assert.equal(core.rewriteMarkup('<p dir=rtl>x</p>'), '<p dir="ltr">x</p>');
  assert.equal(core.rewriteMarkup('para\n{: dir="rtl"}'), 'para\n{: dir="ltr"}');
  assert.equal(core.rewriteMarkup('---\ndirection: rtl\n---\n# hi'), '---\ndirection: ltr\n---\n# hi');
  assert.equal(core.rewriteMarkup('<p dir="rtlx">'), '<p dir="rtlx">', 'only exact tokens');
  assert.equal(core.rewriteMarkup('<p data-dir="rtl">'), '<p data-dir="rtl">', 'not other attributes');
});

test('buildCss: layered by default, three distinct levels', () => {
  const [p, s, n] = core.LEVELS.map((l) => core.buildCss(l));
  assert.match(p, /^@layer downfall-of-rtl \{/);
  assert.match(p, /direction: ltr !important/);
  assert.ok(!p.includes('@font-face'), 'polite does not steal fonts');
  assert.ok(s.includes('@font-face') && s.includes('Comic Sans'));
  assert.ok(n.includes('bidi-override'));
  assert.ok(!core.buildCss('polite', { layer: false }).includes('@layer'));
  assert.equal(core.buildCss('bogus'), s, 'unknown levels default to spicy');
});

test('looksRtlish', () => {
  assert.ok(core.looksRtlish('p{direction: rtl}'));
  assert.ok(core.looksRtlish('[dir="rtl"] p{}'));
  assert.ok(core.looksRtlish('body{font-family:Vazirmatn}'));
  assert.ok(!core.looksRtlish('body{color:red}'));
});

test('rewriteMarkup keeps style attributes valid when swapping in Comic Sans', () => {
  const opts = { fontReplacement: core.COMIC_SANS };
  const dq = core.rewriteMarkup('<div style="font-family: Vazirmatn; direction: rtl">x</div>', opts);
  assert.equal(dq, `<div style="font-family: 'Comic Sans MS', 'Comic Neue', 'Chalkboard SE', cursive; direction: ltr">x</div>`);
  const sq = core.rewriteMarkup("<div style='font-family: \"Vazirmatn\"'>x</div>", opts);
  assert.equal(sq, `<div style='font-family: "Comic Sans MS", "Comic Neue", "Chalkboard SE", cursive'>x</div>`);
});
