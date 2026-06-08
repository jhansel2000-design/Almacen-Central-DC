/**
 * Sincronización de reportes — Internet + LAN + GitHub Pages
 * Todos los usuarios registrados ven los mismos datos.
 */
(function (global) {
  'use strict';

  var SNAPSHOT_KEY = 'averias_dc_snapshot';
  var siteConfig = null;
  var publicBase = '';
  var pollTimer = null;
  var eventSource = null;
  var pushing = false;
  var lastPullAt = 0;

  function mergeAveriasSnapshots(local, remote) {
    if (!remote) return local;
    if (!local) return remote;
    function mergeArr(a, b) {
      var map = {};
      (a || []).forEach(function (x) {
        if (x && x.id != null) map[String(x.id)] = x;
      });
      (b || []).forEach(function (x) {
        if (x && x.id != null) map[String(x.id)] = x;
      });
      return Object.keys(map).map(function (k) { return map[k]; })
        .sort(function (x, y) { return (y.id || 0) - (x.id || 0); });
    }
    var lTime = Date.parse(local.updatedAt) || 0;
    var rTime = Date.parse(remote.updatedAt) || 0;
    return {
      version: 1,
      updatedAt: new Date(Math.max(lTime, rTime)).toISOString(),
      incidences: mergeArr(local.incidences, remote.incidences),
      damages: mergeArr(local.damages, remote.damages),
      securityIncidents: mergeArr(local.securityIncidents, remote.securityIncidents),
      audits5s: mergeArr(local.audits5s, remote.audits5s),
      equipmentInspections: mergeArr(local.equipmentInspections, remote.equipmentInspections),
      equipmentRegistry: Object.assign({}, local.equipmentRegistry || {}, remote.equipmentRegistry || {})
    };
  }

  function isLanHost() {
    if (global.PlatformNetworkRelay && global.PlatformNetworkRelay.isLanHost) {
      return global.PlatformNetworkRelay.isLanHost();
    }
    var h = global.location && global.location.hostname;
    if (!h) return false;
    if (h === 'localhost' || h === '127.0.0.1') return true;
    return /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(h);
  }

  function normalizeBase(url) {
    return String(url || '').trim().replace(/\/+$/, '');
  }

  function getLocalSnapshot() {
    try {
      var raw = global.localStorage.getItem(SNAPSHOT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function applySnapshotToLocal(snap) {
    if (!snap || !global.localStorage) return false;
    try {
      global.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
      global.localStorage.setItem('averias_dc_incidences', JSON.stringify(snap.incidences || []));
      global.localStorage.setItem('averias_dc_damages', JSON.stringify(snap.damages || []));
      global.localStorage.setItem('averias_dc_securityIncidents', JSON.stringify(snap.securityIncidents || []));
      global.localStorage.setItem('averias_dc_audits5s', JSON.stringify(snap.audits5s || []));
      global.localStorage.setItem('averias_dc_equipmentInspections', JSON.stringify(snap.equipmentInspections || []));
      global.localStorage.setItem('averias_dc_equipmentRegistry', JSON.stringify(snap.equipmentRegistry || {}));
      return true;
    } catch (e) {
      return false;
    }
  }

  function notifyUpdated(source) {
    try {
      global.dispatchEvent(new CustomEvent('averias-updated', { detail: { source: source || 'cloud' } }));
    } catch (e) { /* noop */ }
  }

  function fetchJson(url, opts) {
    opts = opts || {};
    return global.fetch(url, Object.assign({ cache: 'no-store' }, opts)).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  function resolvePublicBase() {
    if (publicBase) return publicBase;
    if (siteConfig && normalizeBase(siteConfig.publicSyncBaseUrl)) {
      publicBase = normalizeBase(siteConfig.publicSyncBaseUrl);
      return publicBase;
    }
    if (global.PlatformNetworkRelay) {
      var relay = global.PlatformNetworkRelay.readRelayConfig && global.PlatformNetworkRelay.readRelayConfig();
      if (relay && relay.enabled && normalizeBase(relay.baseUrl)) {
        publicBase = normalizeBase(relay.baseUrl);
        return publicBase;
      }
    }
    if (isLanHost()) return '';
    return '';
  }

  function apiUrl(path) {
    var base = resolvePublicBase();
    if (base) return base + path;
    return path;
  }

  function staticDataUrl() {
    if (siteConfig && siteConfig.githubPagesDataUrl) return siteConfig.githubPagesDataUrl;
    if (global.PlatformNetworkRelay && global.PlatformNetworkRelay.isPublicHost && global.PlatformNetworkRelay.isPublicHost()) {
      return 'https://jhansel2000-design.github.io/Almacen-Central-DC/data/averias.json';
    }
    return 'data/averias.json';
  }

  function loadSiteConfig() {
    return fetchJson('data/site-config.json?t=' + Date.now()).then(function (cfg) {
      siteConfig = cfg || {};
      publicBase = normalizeBase(siteConfig.publicSyncBaseUrl) || publicBase;
      return siteConfig;
    }).catch(function () {
      siteConfig = siteConfig || {};
      return siteConfig;
    });
  }

  function probeServerBase(base) {
    if (!base) return Promise.resolve(false);
    return fetchJson(base + '/api/health').then(function (h) {
      return !!(h && h.ok);
    }).catch(function () { return false; });
  }

  function pullFromServer() {
    var url = apiUrl('/api/data/averias');
    return fetchJson(url).then(function (res) {
      return res && res.data ? res.data : null;
    }).catch(function () { return null; });
  }

  function pullFromStatic() {
    return fetchJson(staticDataUrl() + '?t=' + Date.now()).catch(function () { return null; });
  }

  function pullFromJsonBin() {
    var jb = siteConfig && siteConfig.averiasJsonBin;
    if (!jb || !jb.enabled || !jb.binId || !jb.accessKey) return Promise.resolve(null);
    return global.fetch('https://api.jsonbin.io/v3/b/' + jb.binId + '/latest', {
      headers: { 'X-Access-Key': jb.accessKey },
      cache: 'no-store'
    }).then(function (res) {
      if (!res.ok) throw new Error('jsonbin');
      return res.json();
    }).then(function (body) {
      return body && body.record ? body.record : null;
    }).catch(function () { return null; });
  }

  function pullAll() {
    return Promise.all([pullFromServer(), pullFromStatic(), pullFromJsonBin()]).then(function (parts) {
      var merged = getLocalSnapshot();
      parts.forEach(function (part) {
        if (part) merged = mergeAveriasSnapshots(merged, part);
      });
      if (merged) {
        applySnapshotToLocal(merged);
        lastPullAt = Date.now();
        notifyUpdated('pull');
      }
      return merged;
    });
  }

  function pushToServer(snap) {
    var url = apiUrl('/api/data/averias');
    return global.fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: snap, source: 'client' })
    }).then(function (res) {
      if (!res.ok) throw new Error('push server failed');
      return true;
    }).catch(function () { return false; });
  }

  function pushToJsonBin(snap) {
    var jb = siteConfig && siteConfig.averiasJsonBin;
    if (!jb || !jb.enabled || !jb.binId || !jb.accessKey) return Promise.resolve(false);
    return global.fetch('https://api.jsonbin.io/v3/b/' + jb.binId, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Access-Key': jb.accessKey
      },
      body: JSON.stringify(snap)
    }).then(function (res) { return res.ok; }).catch(function () { return false; });
  }

  function pushSnapshot(snap) {
    if (!snap || pushing) return Promise.resolve(false);
    pushing = true;
    snap.updatedAt = new Date().toISOString();
    applySnapshotToLocal(snap);
    return Promise.all([pushToServer(snap), pushToJsonBin(snap)]).then(function (results) {
      var ok = results.some(Boolean);
      if (ok && isLanHost()) {
        global.fetch('/api/publish-averias-live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: snap })
        }).catch(function () { /* noop */ });
      }
      return ok;
    }).finally(function () {
      pushing = false;
    });
  }

  function startSSE() {
    var base = resolvePublicBase();
    if (!base || !global.EventSource) return;
    if (eventSource) {
      try { eventSource.close(); } catch (e) { /* noop */ }
    }
    try {
      eventSource = new global.EventSource(base + '/api/events');
      eventSource.addEventListener('update', function (ev) {
        var payload;
        try { payload = JSON.parse(ev.data); } catch (e) { return; }
        if (payload && payload.store === 'averias') pullAll();
      });
    } catch (e) { /* noop */ }
  }

  function startPolling() {
    clearInterval(pollTimer);
    var sec = (siteConfig && siteConfig.pollSeconds) || 15;
    pollTimer = global.setInterval(function () {
      if (document.visibilityState === 'visible') pullAll();
    }, Math.max(8, sec) * 1000);
  }

  function updateSyncBadge() {
    var btn = global.document.getElementById('btnSyncAverias');
    if (!btn) return;
    var online = !!(resolvePublicBase() || (siteConfig && siteConfig.averiasJsonBin && siteConfig.averiasJsonBin.enabled));
    btn.title = online
      ? 'Sincronizar reportes (internet activo)'
      : 'Sincronizar reportes (GitHub + servidor cloud)';
    btn.classList.toggle('cloud-active', online);
  }

  function init() {
    return loadSiteConfig().then(function () {
      return probeServerBase(resolvePublicBase()).then(function (alive) {
        if (!alive && siteConfig && siteConfig.publicSyncBaseUrl) {
          publicBase = '';
        }
        updateSyncBadge();
        return pullAll();
      });
    }).then(function () {
      startPolling();
      startSSE();
      global.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') pullAll();
      }, { passive: true });
      document.addEventListener('lan-ready', function () {
        publicBase = resolvePublicBase();
        pullAll();
        startSSE();
        updateSyncBadge();
      });
      document.addEventListener('lan-sync', function (ev) {
        if (ev.detail && ev.detail.store === 'averias') notifyUpdated('lan');
      });
    });
  }

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  global.PlatformAveriasCloudSync = {
    mergeAveriasSnapshots: mergeAveriasSnapshots,
    pull: pullAll,
    push: pushSnapshot,
    isCloudConfigured: function () {
      return !!(resolvePublicBase() || (siteConfig && siteConfig.averiasJsonBin && siteConfig.averiasJsonBin.enabled));
    },
    getPublicBase: function () { return resolvePublicBase(); },
    getLastPullAt: function () { return lastPullAt; }
  };
})(typeof window !== 'undefined' ? window : this);
