(function (global) {
  'use strict';
  var SK = 'dc_relay_redirect_v1';
  try {
    if (global.sessionStorage && global.sessionStorage.getItem(SK)) return;
    var cfg = JSON.parse(global.localStorage.getItem('almacen_platform_config') || '{}');
    var r = cfg.networkRelay;
    if (!r || !r.enabled || !r.baseUrl || r.autoRedirect === false) return;
    var h = global.location.hostname || '';
    if (h.indexOf('github.io') === -1 && h.indexOf('githubusercontent.com') === -1) return;
    var base = String(r.baseUrl).trim().replace(/\/+$/, '');
    if (!base) return;
    var ctrl = global.AbortController ? new global.AbortController() : null;
    var timer = global.setTimeout(function () { if (ctrl) ctrl.abort(); }, 3200);
    var opts = { cache: 'no-store', mode: 'cors' };
    if (ctrl) opts.signal = ctrl.signal;
    global.fetch(base + '/api/health', opts).then(function (res) {
      global.clearTimeout(timer);
      if (!res || !res.ok) return;
      if (global.sessionStorage) global.sessionStorage.setItem(SK, '1');
      global.location.replace(base + global.location.pathname + global.location.search + global.location.hash);
    }).catch(function () { global.clearTimeout(timer); });
  } catch (e) { /* noop */ }
})(typeof window !== 'undefined' ? window : this);
