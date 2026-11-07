/* global DownfallOfRTL, chrome */
(() => {
  'use strict';
  const DEFAULTS = { level: 'spicy', mercy: [] };
  const host = location.hostname;
  let engine = null;

  // Claim our cascade layer before the page (or any RTL plugin) declares one.
  const claim = document.createElement('style');
  claim.textContent = '@layer downfall-of-rtl;';
  (document.head || document.documentElement).prepend(claim);

  function report(total) {
    try { chrome.runtime.sendMessage({ type: 'stats', total }); } catch (_) { /* extension reloaded */ }
  }

  function start(settings) {
    if (engine) { engine.surrender(); engine = null; }
    if (settings.mercy.includes(host)) { report(0); return; }
    engine = DownfallOfRTL.unleash({
      level: settings.level,
      onStats: (_, total) => report(total),
    });
  }

  chrome.storage.sync.get(DEFAULTS, start);

  chrome.storage.onChanged.addListener((_, area) => {
    if (area === 'sync') chrome.storage.sync.get(DEFAULTS, start);
  });

  chrome.runtime.onMessage.addListener((msg, _, reply) => {
    if (msg && msg.type === 'getStats' && window === window.top) {
      reply({
        host,
        level: engine ? engine.level : null,
        stats: engine ? engine.stats : null,
        total: engine ? engine.total() : 0,
      });
    }
  });
})();
