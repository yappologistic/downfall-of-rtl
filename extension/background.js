/* global chrome, importScripts, DownfallOfRTL */
'use strict';
// The heavy artillery. Content scripts inject *author* CSS, which a determined
// RTL plugin can still out-!important with inline styles. CSS injected here with
// origin "USER" sits above every author style in the cascade, inline
// !important included. There is no appeal.

if (typeof DownfallOfRTL === 'undefined' && typeof importScripts === 'function') {
  importScripts('core.js'); // Chrome service worker
}
const engine = typeof DownfallOfRTL !== 'undefined' ? DownfallOfRTL : self.DownfallOfRTL;
const DEFAULTS = { level: 'spicy', mercy: [] };
const applied = new Map(); // tabId -> css string currently injected

const userCss = (level) => engine.buildCss(level, { layer: false, fontFaces: false });
const hostOf = (url) => { try { return new URL(url).hostname; } catch (_) { return ''; } };
const isWebby = (url) => /^(https?|file):/.test(url || '');

async function settings() {
  return chrome.storage.sync.get(DEFAULTS);
}

async function apply(tabId, url, s) {
  s = s || (await settings());
  const old = applied.get(tabId);
  if (old) {
    await chrome.scripting.removeCSS({ target: { tabId, allFrames: true }, css: old, origin: 'USER' }).catch(() => {});
    applied.delete(tabId);
  }
  if (!isWebby(url) || s.mercy.includes(hostOf(url))) return;
  const css = userCss(s.level);
  await chrome.scripting
    .insertCSS({ target: { tabId, allFrames: true }, css, origin: 'USER' })
    .then(() => applied.set(tabId, css))
    .catch(() => {}); // chrome://, the web store, etc. are out of our jurisdiction
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'loading') {
    applied.delete(tabId); // a new document has no CSS of ours yet
    apply(tabId, tab.url);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => applied.delete(tabId));

chrome.storage.onChanged.addListener(async (_, area) => {
  if (area !== 'sync') return;
  const s = await settings();
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) apply(t.id, t.url, s);
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === 'stats' && sender.tab && sender.frameId === 0) {
    const n = msg.total;
    const text = n === 0 ? '' : n > 999 ? '999+' : String(n);
    chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: '#d11' });
    chrome.action.setBadgeText({ tabId: sender.tab.id, text });
  }
});
