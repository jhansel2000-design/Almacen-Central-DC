/**
 * Sincronización en tiempo real — Despacho (operador ↔ validador ↔ pantalla TV)
 * JSONBin + LAN + polling ~1s en GitHub Pages
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'almacen_platform_data_despacho';
  var pollTimer = null;
  var pushing = false;
  var pulling = false;
  var applyingRemote = false;
  var siteConfig = null;
  var lastPullAt = 0;
  var lastAppliedSig = '';
  var lastJsonBinError = 0;
  var broadcast = typeof global.BroadcastChannel !== 'undefined'
    ? new global.BroadcastChannel('despacho-cloud-live')
    : null;

  function nowIso() {
    return new Date().toISOString();
  }

  function isPublicHost() {
    try {
      var h = global.location.hostname;
      return h.indexOf('github.io') >= 0 || h.indexOf('pages.dev') >= 0;
    } catch (e) {
      return false;
    }
  }

  function isLanHost() {
    try {
      var p = global.location.port;
      return p === '8080' || p === '3000' || p === '8787';
    } catch (e) {
      return false;
    }
  }

  function fetchJson(url) {
    return global.fetch(url, { cache: 'no-store', mode: 'cors' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  function siteConfigUrl() {
    if (global.PlatformSecurity && global.PlatformSecurity.siteConfigUrl) {
      return global.PlatformSecurity.siteConfigUrl();
    }
    return 'data/site-config.json';
  }

  function loadSiteConfig() {
    return fetchJson(siteConfigUrl() + '?t=' + Date.now()).then(function (cfg) {
      siteConfig = cfg || {};
      return siteConfig;
    }).catch(function () {
      siteConfig = siteConfig || {};
      return siteConfig;
    });
  }

  function getJsonBinConfig() {
    var jb = siteConfig && siteConfig.despachoJsonBin;
    if (!jb || !jb.enabled || !jb.binId || !jb.accessKey) return null;
    return jb;
  }

  function jsonBinAuthHeaders(jb) {
    var key = jb.accessKey;
    if (jb.keyType === 'master' || /^\$2[ab]\$/.test(String(key || ''))) {
      return { 'X-Master-Key': key };
    }
    return { 'X-Access-Key': key };
  }

  function getLocalData() {
    if (!global.localStorage) return null;
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function pedidoTime(p) {
    return Date.parse(p && p.updatedAt) || Date.parse(p && p.createdAt) || 0;
  }

  function shareTime(share) {
    return Date.parse(share && share.updatedAt) || 0;
  }

  function mergeDespacho(local, remote) {
    if (!remote) return local;
    if (!local) return remote;

    var map = {};
    (local.pedidos || []).forEach(function (p) {
      if (p && p.id) map[p.id] = p;
    });
    (remote.pedidos || []).forEach(function (p) {
      if (!p || !p.id) return;
      var prev = map[p.id];
      if (!prev || pedidoTime(p) >= pedidoTime(prev)) map[p.id] = p;
    });

    var merged = Object.assign({}, (Date.parse(remote.updatedAt) || 0) >= (Date.parse(local.updatedAt) || 0) ? remote : local, {
      module: 'despacho',
      pedidos: Object.keys(map).map(function (k) { return map[k]; })
    });

    merged.liveShare = shareTime(remote.liveShare) >= shareTime(local.liveShare)
      ? remote.liveShare
      : local.liveShare;
    merged.liveShareLista = shareTime(remote.liveShareLista) >= shareTime(local.liveShareLista)
      ? remote.liveShareLista
      : local.liveShareLista;

    var tLocal = Date.parse(local.updatedAt) || 0;
    var tRemote = Date.parse(remote.updatedAt) || 0;
    merged.updatedAt = new Date(Math.max(tLocal, tRemote)).toISOString();
    return merged;
  }

  function dataSignature(data) {
    if (!data) return '';
    var ped = (data.pedidos || []).map(function (p) {
      return String(p.id) + ':' + String(p.estado) + '@' + String(p.updatedAt || '');
    }).sort().join('|');
    var ls = data.liveShare && data.liveShare.active
      ? String(data.liveShare.idc) + '~' + String(data.liveShare.jaula) + '@' + String(data.liveShare.updatedAt)
      : '';
    var ll = data.liveShareLista && data.liveShareLista.active
      ? 'L@' + String(data.liveShareLista.updatedAt)
      : '';
    return ped + '||' + ls + '||' + ll + '||' + String(data.updatedAt || '');
  }

  function notifyApplied(data, source) {
    try {
      global.dispatchEvent(new CustomEvent('despacho-updated', {
        detail: { data: data, at: nowIso(), source: source || 'cloud' }
      }));
    } catch (e) { /* noop */ }
    if (data && data.liveShare) {
      try {
        global.dispatchEvent(new CustomEvent('despacho-live-share', {
          detail: { share: data.liveShare, at: nowIso(), source: source || 'cloud' }
        }));
      } catch (e) { /* noop */ }
    }
    if (data && data.liveShareLista) {
      try {
        global.dispatchEvent(new CustomEvent('despacho-live-lista', {
          detail: { share: data.liveShareLista, at: nowIso(), source: source || 'cloud' }
        }));
      } catch (e) { /* noop */ }
    }
  }

  function applyRemote(data, source) {
    if (!global.localStorage || !data) return false;
    var sig = dataSignature(data);
    if (sig === lastAppliedSig) return false;
    applyingRemote = true;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } finally {
      applyingRemote = false;
    }
    lastAppliedSig = sig;
    notifyApplied(data, source);
    return true;
  }

  function pullFromJsonBin() {
    var jb = getJsonBinConfig();
    if (!jb) return Promise.resolve(null);
    return global.fetch('https://api.jsonbin.io/v3/b/' + jb.binId + '/latest?t=' + Date.now(), {
      headers: jsonBinAuthHeaders(jb),
      cache: 'no-store',
      mode: 'cors'
    }).then(function (res) {
      if (!res.ok) {
        lastJsonBinError = Date.now();
        throw new Error('jsonbin ' + res.status);
      }
      return res.json();
    }).then(function (body) {
      return body && body.record ? body.record : null;
    }).catch(function () {
      lastJsonBinError = Date.now();
      return null;
    });
  }

  function pullAll() {
    if (pulling) return Promise.resolve(getLocalData());
    pulling = true;
    return pullFromJsonBin().then(function (remote) {
      if (!remote) return getLocalData();
      var local = getLocalData();
      var merged = mergeDespacho(local, remote);
      if (merged) applyRemote(merged, 'jsonbin');
      lastPullAt = Date.now();
      return merged;
    }).finally(function () {
      pulling = false;
    });
  }

  function pushToJsonBin(data) {
    var jb = getJsonBinConfig();
    if (!jb || !data) return Promise.resolve(false);
    var headers = jsonBinAuthHeaders(jb);
    headers['Content-Type'] = 'application/json';
    data = Object.assign({}, data, { module: 'despacho', updatedAt: nowIso() });
    return global.fetch('https://api.jsonbin.io/v3/b/' + jb.binId, {
      method: 'PUT',
      headers: headers,
      body: JSON.stringify(data),
      mode: 'cors'
    }).then(function (res) {
      return res.ok;
    }).catch(function () {
      return false;
    });
  }

  function pushLocal(retries) {
    if (pushing || applyingRemote) return Promise.resolve(false);
    var local = getLocalData();
    if (!local) return Promise.resolve(false);
    if (!getJsonBinConfig()) return Promise.resolve(false);
    pushing = true;
    retries = retries == null ? 2 : retries;

    function attempt(n, payload) {
      return pushToJsonBin(payload).then(function (ok) {
        if (ok) {
          if (broadcast) {
            try { broadcast.postMessage({ type: 'despacho-sync', at: Date.now() }); } catch (e) { /* noop */ }
          }
          return true;
        }
        if (n < retries) {
          return new Promise(function (resolve) {
            global.setTimeout(function () { resolve(attempt(n + 1, payload)); }, 350);
          });
        }
        return false;
      });
    }

    return pullFromJsonBin().then(function (remote) {
      var payload = mergeDespacho(local, remote);
      if (payload) {
        applyingRemote = true;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } finally {
          applyingRemote = false;
        }
        lastAppliedSig = dataSignature(payload);
      }
      return attempt(0, payload || local);
    }).finally(function () {
      pushing = false;
    });
  }

  function pollIntervalMs() {
    var sec = (siteConfig && siteConfig.pollSeconds) || 1;
    if (siteConfig && siteConfig.realtime === false) sec = 5;
    return Math.max(1, sec) * 1000;
  }

  function startPolling() {
    clearTimeout(pollTimer);
    function loop() {
      if (global.document && global.document.visibilityState === 'hidden') {
        pollTimer = global.setTimeout(loop, pollIntervalMs() * 2);
        return;
      }
      pullAll().finally(function () {
        pollTimer = global.setTimeout(loop, pollIntervalMs());
      });
    }
    pollTimer = global.setTimeout(loop, pollIntervalMs());
  }

  function hookLocalStorage() {
    if (!global.localStorage || global.localStorage.__despachoCloudHooked) return;
    var proto = Storage.prototype;
    var orig = proto.setItem;
    proto.setItem = function (key, value) {
      orig.call(this, key, value);
      if (key === STORAGE_KEY && !applyingRemote) {
        clearTimeout(hookLocalStorage.pushTimer);
        hookLocalStorage.pushTimer = global.setTimeout(function () {
          pushLocal();
        }, 280);
      }
    };
    global.localStorage.__despachoCloudHooked = true;
  }

  function init() {
    loadSiteConfig().then(function () {
      if (!getJsonBinConfig()) {
        console.warn('[DespachoCloud] Sin despachoJsonBin en site-config — sync nube desactivada');
        return;
      }
      hookLocalStorage();
      var local = getLocalData();
      if (local) lastAppliedSig = dataSignature(local);
      return pullAll().then(function () {
        var after = getLocalData();
        if (after && !lastAppliedSig) lastAppliedSig = dataSignature(after);
        var remoteEmpty = !after || !(after.pedidos && after.pedidos.length);
        if (local && local.pedidos && local.pedidos.length && remoteEmpty) {
          return pushLocal();
        }
      });
    }).then(function () {
      if (!getJsonBinConfig()) return;
      startPolling();
      global.addEventListener('visibilitychange', function () {
        if (global.document.visibilityState === 'visible') pullAll();
      }, { passive: true });
      global.addEventListener('focus', function () { pullAll(); }, { passive: true });
      global.addEventListener('lan-sync', function (ev) {
        if (ev.detail && ev.detail.store === 'despacho') pullAll();
      });
      if (broadcast) {
        broadcast.onmessage = function () { pullAll(); };
      }
    });
  }

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  global.PlatformDespachoCloudSync = {
    pullAll: pullAll,
    pushLocal: pushLocal,
    isConfigured: function () { return !!getJsonBinConfig(); },
    getLastPullAt: function () { return lastPullAt; }
  };
})(typeof window !== 'undefined' ? window : this);
