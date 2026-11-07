/* global chrome */
'use strict';
const DEFAULTS = { level: 'spicy', mercy: [] };
const TAGLINES = [
  "Text goes left to right. That's it.",
  'An RTL plugin for the RTL plugins, but backwards.',
  'Every RLM you send, we turn into an LRM.',
  'Vazirmatn has left the chat.',
  'Right is wrong.',
  'Made with ❤️ and a strong sense of direction.',
];
const $ = (id) => document.getElementById(id);

$('tagline').textContent = TAGLINES[Math.floor(Math.random() * TAGLINES.length)];

(async () => {
  const s = await chrome.storage.sync.get(DEFAULTS);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let host = '';
  try { host = new URL(tab.url).hostname; } catch (_) { /* chrome:// etc */ }

  for (const r of document.querySelectorAll('input[name=level]')) {
    r.checked = r.value === s.level;
    r.addEventListener('change', () => chrome.storage.sync.set({ level: r.value }));
  }

  $('mercyhost').textContent = host || 'this page';
  $('mercy').disabled = !host;
  $('mercy').checked = !!host && s.mercy.includes(host);
  $('mercy').addEventListener('change', async (e) => {
    const cur = (await chrome.storage.sync.get(DEFAULTS)).mercy.filter((h) => h !== host);
    if (e.target.checked) cur.push(host);
    await chrome.storage.sync.set({ mercy: cur });
  });

  const refresh = () =>
    chrome.tabs.sendMessage(tab.id, { type: 'getStats' }).then(
      (r) => {
        if (!r) return;
        $('total').textContent = r.total.toLocaleString('en-US'); // Western digits only, obviously
        $('host').textContent = r.level ? `RTL attempts neutralized on ${r.host}` : `${r.host} is under mercy`;
      },
      () => { $('host').textContent = 'This page is outside our jurisdiction'; }
    );
  refresh();
  setInterval(refresh, 1000);
})();
