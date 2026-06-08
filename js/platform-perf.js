/**
 * Detección de rendimiento — video ligero, poster en equipos lentos
 */
(function (global) {
  'use strict';

  function shouldUsePerfLite() {
    try {
      if (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return true;
      }
      var conn = global.navigator && global.navigator.connection;
      if (conn) {
        if (conn.saveData) return true;
        var type = conn.effectiveType;
        if (type === 'slow-2g' || type === '2g') return true;
      }
      var cores = global.navigator && global.navigator.hardwareConcurrency;
      if (cores && cores <= 2) return true;
      var mem = global.navigator && global.navigator.deviceMemory;
      if (mem && mem <= 2) return true;
    } catch (e) { /* ignore */ }
    return false;
  }

  function applyPerfLite() {
    if (!shouldUsePerfLite()) return false;
    var root = global.document && global.document.documentElement;
    if (root) root.classList.add('perf-lite');
    return true;
  }

  function primeAuthVideoElement(video) {
    if (!video || video.dataset.perfPrimed === '1') return;
    video.dataset.perfPrimed = '1';
    if (applyPerfLite()) {
      try { video.pause(); } catch (e) { /* ignore */ }
      video.preload = 'none';
      return;
    }
    video.preload = 'metadata';
  }

  applyPerfLite();

  global.PlatformPerf = {
    shouldUsePerfLite: shouldUsePerfLite,
    applyPerfLite: applyPerfLite,
    primeAuthVideoElement: primeAuthVideoElement,
    AUTH_VIDEO_LITE: 'assets/video/login-operation-lite.mp4'
  };
})(typeof window !== 'undefined' ? window : this);
