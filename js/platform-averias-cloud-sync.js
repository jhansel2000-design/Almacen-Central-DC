/**
 * Sincronización casi en tiempo real — Firebase + SSE + JSONBin + servidor
 */
(function (global) {
  'use strict';

  var SNAPSHOT_KEY = 'averias_dc_snapshot';
  var EMPTY = {
    version: 1,
    updatedAt: '1970-01-01T00:00:00.000Z',
    incidences: [],
    damages: [],
    securityIncidents: [],
    audits5s: [],
    equipmentInspections: [],
    equipmentRegistry: {}
  };

  var siteConfig = null;
  var publicBase = '';
  var pollTimer = null;
  var pollSlowTimer = null;
  var eventSource = null;
  var sseRetryTimer = null;
  var pushing = false;
  var pulling = false;
  var lastPullAt = 0;
  var lastAppliedJson = '';
  var firebaseDb = null;
  var firebaseBound = false;
  var staticPollCounter = 0;

  function pollIntervalMs() {
    var sec = (siteConfig && siteConfig.pollSeconds) || 2;
    if (siteConfig && siteConfig.realtime === false) sec = 8;
    return Math.max(2, sec) * 1000;
  }

  function mergeAveriasSnapshots(local, remote) {
    if (!remote) return local || EMPTY;
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

  function isPublicHost() {
    if (global.PlatformNetworkRelay && global.PlatformNetworkRelay.isPublicHost) {
      return global.PlatformNetworkRelay.isPublicHost();
    }
    var h = global.location && global.location.hostname || '';
    return h.indexOf('github.io') !== -1 || h.indexOf('githubusercontent.com') !== -1;
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

  function applySnapshotToLocal(snap, silent) {
    if (!snap || !global.localStorage) return false;
    var json = JSON.stringify(snap);
    if (json === lastAppliedJson) return false;
    try {
      global.localStorage.setItem(SNAPSHOT_KEY, json);
      global.localStorage.setItem('averias_dc_incidences', JSON.stringify(snap.incidences || []));
      global.localStorage.setItem('averias_dc_damages', JSON.stringify(snap.damages || []));
      global.localStorage.setItem('averias_dc_securityIncidents', JSON.stringify(snap.securityIncidents || []));
      global.localStorage.setItem('averias_dc_audits5s', JSON.stringify(snap.audits5s || []));
      global.localStorage.setItem('averias_dc_equipmentInspections', JSON.stringify(snap.equipmentInspections || []));
      global.localStorage.setItem('averias_dc_equipmentRegistry', JSON.stringify(snap.equipmentRegistry || {}));
      lastAppliedJson = json;
      if (!silent) notifyUpdated('apply');
      updateLiveIndicator(true);
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
    return global.fetch(url, Object.assign({ cache: 'no-store', mode: 'cors' }, opts)).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  function applySiteConfigRelay() {
    var url = siteConfig && normalizeBase(siteConfig.publicSyncBaseUrl);
    if (!url || !global.PlatformNetworkRelay || !global.PlatformNetworkRelay.saveRelayConfig) return;
    global.PlatformNetworkRelay.saveRelayConfig({
      enabled: true,
      baseUrl: url,
      autoRedirect: false
    });
    if (global.PlatformNetworkRelay.applyRelayFromConfig) {
      global.PlatformNetworkRelay.applyRelayFromConfig();
    }
    publicBase = url;
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
    return '';
  }

  function canUseServerApi() {
    return !!(resolvePublicBase() || isLanHost());
  }

  function apiUrl(path) {
    var base = resolvePublicBase();
    if (base) return base + path;
    return path;
  }

  function staticDataUrl() {
    if (siteConfig && siteConfig.githubPagesDataUrl) return siteConfig.githubPagesDataUrl;
    if (isPublicHost()) {
      return 'https://jhansel2000-design.github.io/Almacen-Central-DC/data/averias.json';
    }
    return 'data/averias.json';
  }

  function loadSiteConfig() {
    return fetchJson('data/site-config.json?t=' + Date.now()).then(function (cfg) {
      siteConfig = cfg || {};
      applySiteConfigRelay();
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

  function initFirebase() {
    var fb = siteConfig && siteConfig.firebase;
    if (!fb || !fb.enabled || !fb.databaseURL || typeof global.firebase === 'undefined') {
      return Promise.resolve(false);
    }
    try {
      if (!global.firebase.apps.length) {
        global.firebase.initializeApp({
          apiKey: fb.apiKey,
          authDomain: fb.authDomain,
          databaseURL: fb.databaseURL,
          projectId: fb.projectId
        });
      }
      firebaseDb = global.firebase.database();
      if (!firebaseBound) {
        firebaseBound = true;
        firebaseDb.ref('averias/snapshot').on('value', function (snap) {
          var val = snap.val();
          if (!val) return;
          var merged = mergeAveriasSnapshots(getLocalSnapshot(), val);
          applySnapshotToLocal(merged);
        });
      }
      return Promise.resolve(true);
    } catch (e) {
      console.warn('[AveriasCloud] Firebase init error:', e);
      return Promise.resolve(false);
    }
  }

  function pullFromServer() {
    if (!canUseServerApi()) return Promise.resolve(null);
    return fetchJson(apiUrl('/api/data/averias')).then(function (res) {
      return res && res.data ? res.data : null;
    }).catch(function () { return null; });
  }

  function pullFromStatic() {
    staticPollCounter += 1;
    var hasFastSource = isCloudConfigured() || canUseServerApi();
    if (hasFastSource && staticPollCounter % 3 !== 0) {
      return Promise.resolve(null);
    }
    return fetchJson(staticDataUrl() + '?t=' + Date.now()).catch(function () { return null; });
  }

  function pullFromJsonBin() {
    var jb = siteConfig && siteConfig.averiasJsonBin;
    if (!jb || !jb.enabled || !jb.binId || !jb.accessKey) return Promise.resolve(null);
    return global.fetch('https://api.jsonbin.io/v3/b/' + jb.binId + '/latest', {
      headers: { 'X-Access-Key': jb.accessKey },
      cache: 'no-store',
      mode: 'cors'
    }).then(function (res) {
      if (!res.ok) throw new Error('jsonbin');
      return res.json();
    }).then(function (body) {
      return body && body.record ? body.record : null;
    }).catch(function () { return null; });
  }

  function pullFromFirebaseOnce() {
    if (!firebaseDb || firebaseBound) return Promise.resolve(null);
    return firebaseDb.ref('averias/snapshot').once('value').then(function (snap) {
      return snap.val() || null;
    }).catch(function () { return null; });
  }

  function pullAll() {
    if (pulling) return Promise.resolve(getLocalSnapshot());
    pulling = true;
    return Promise.all([
      pullFromServer(),
      pullFromStatic(),
      pullFromJsonBin(),
      pullFromFirebaseOnce()
    ]).then(function (parts) {
      var merged = getLocalSnapshot() || EMPTY;
      parts.forEach(function (part) {
        if (part) merged = mergeAveriasSnapshots(merged, part);
      });
      if (merged) {
        applySnapshotToLocal(merged);
        lastPullAt = Date.now();
      }
      return merged;
    }).finally(function () {
      pulling = false;
    });
  }

  function schedulePullBurst() {
    [350, 900, 1800, 3500].forEach(function (ms) {
      global.setTimeout(function () { pullAll(); }, ms);
    });
  }

  function pushToServer(snap) {
    if (!canUseServerApi()) return Promise.resolve(false);
    return global.fetch(apiUrl('/api/data/averias'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: snap, source: 'client' })
    }).then(function (res) {
      return res.ok;
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
      body: JSON.stringify(snap),
      mode: 'cors'
    }).then(function (res) { return res.ok; }).catch(function () { return false; });
  }

  function pushToFirebase(snap) {
    if (!firebaseDb) return Promise.resolve(false);
    return firebaseDb.ref('averias/snapshot').set(snap).then(function () {
      return true;
    }).catch(function () { return false; });
  }

  function pushSnapshot(snap, retries) {
    if (!snap) return Promise.resolve({ ok: false, reason: 'empty' });
    if (pushing) {
      return new Promise(function (resolve) {
        global.setTimeout(function () { resolve(pushSnapshot(snap, retries)); }, 200);
      });
    }
    pushing = true;
    retries = retries == null ? 3 : retries;
    snap.updatedAt = new Date().toISOString();
    applySnapshotToLocal(snap, true);
    notifyUpdated('push-local');

    function attempt(n) {
      return Promise.all([
        pushToServer(snap),
        pushToJsonBin(snap),
        pushToFirebase(snap)
      ]).then(function (results) {
        var ok = results.some(Boolean);
        if (ok) {
          if (isLanHost()) {
            global.fetch('/api/publish-averias-live', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ data: snap })
            }).catch(function () { /* noop */ });
          }
          schedulePullBurst();
          notifyUpdated('push-ok');
          return { ok: true };
        }
        if (n < retries) {
          return new Promise(function (resolve) {
            global.setTimeout(function () { resolve(attempt(n + 1)); }, 400);
          });
        }
        return { ok: false, reason: 'no-cloud' };
      });
    }

    return attempt(0).finally(function () {
      pushing = false;
    });
  }

  function sseEndpoint() {
    var base = resolvePublicBase();
    if (base) return base + '/api/events';
    if (isLanHost()) return '/api/events';
    return '';
  }

  function startSSE() {
    var url = sseEndpoint();
    if (!url || !global.EventSource) return;
    if (eventSource) {
      try { eventSource.close(); } catch (e) { /* noop */ }
      eventSource = null;
    }
    clearTimeout(sseRetryTimer);
    try {
      eventSource = new global.EventSource(url);
      eventSource.addEventListener('update', function (ev) {
        var payload;
        try { payload = JSON.parse(ev.data); } catch (e) { return; }
        if (payload && payload.store === 'averias') pullAll();
      });
      eventSource.onerror = function () {
        try { eventSource.close(); } catch (e) { /* noop */ }
        eventSource = null;
        sseRetryTimer = global.setTimeout(startSSE, 3000);
      };
    } catch (e) {
      sseRetryTimer = global.setTimeout(startSSE, 3000);
    }
  }

  function tickPoll() {
    if (document.visibilityState !== 'visible') return;
    pullAll();
  }

  function startPolling() {
    clearInterval(pollTimer);
    clearInterval(pollSlowTimer);
    pollTimer = global.setInterval(tickPoll, pollIntervalMs());
    pollSlowTimer = global.setInterval(function () {
      if (document.visibilityState === 'hidden') pullAll();
    }, 20000);
  }

  function isCloudConfigured() {
    var jb = siteConfig && siteConfig.averiasJsonBin;
    var fb = siteConfig && siteConfig.firebase;
    return !!(
      resolvePublicBase() ||
      isLanHost() ||
      (jb && jb.enabled && jb.binId && jb.accessKey) ||
      (fb && fb.enabled && fb.databaseURL)
    );
  }

  function updateLiveIndicator(active) {
    var btn = global.document.getElementById('btnSyncAverias');
    if (!btn) return;
    btn.classList.toggle('sync-live', !!active && isCloudConfigured());
  }

  function updateSyncUi() {
    var btn = global.document.getElementById('btnSyncAverias');
    if (btn) {
      var online = isCloudConfigured();
      btn.title = online
        ? 'Tiempo real activo — sincroniza cada ' + ((siteConfig && siteConfig.pollSeconds) || 2) + 's'
        : 'Sin nube — ejecute setup-averias-cloud.ps1 en el servidor';
      btn.classList.toggle('cloud-active', online);
    }
    var banner = global.document.getElementById('avSyncBanner');
    if (banner) {
      banner.hidden = isCloudConfigured();
    }
    var live = global.document.getElementById('avSyncLive');
    if (live) {
      live.hidden = !isCloudConfigured();
    }
  }

  function init() {
    return loadSiteConfig().then(function () {
      return initFirebase();
    }).then(function () {
      return probeServerBase(resolvePublicBase()).then(function (alive) {
        if (!alive && siteConfig && siteConfig.publicSyncBaseUrl && !isLanHost()) {
          publicBase = '';
        }
        updateSyncUi();
        return pullAll();
      });
    }).then(function () {
      startPolling();
      startSSE();
      global.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') {
          pullAll();
          startSSE();
        }
      }, { passive: true });
      global.addEventListener('focus', function () { pullAll(); }, { passive: true });
      document.addEventListener('lan-ready', function () {
        publicBase = resolvePublicBase();
        pullAll();
        startSSE();
        updateSyncUi();
      });
      document.addEventListener('lan-sync', function (ev) {
        if (ev.detail && ev.detail.store === 'averias') {
          pullAll();
        }
      });
      global.setInterval(function () {
        if (Date.now() - lastPullAt < 8000) updateLiveIndicator(true);
        else updateLiveIndicator(false);
      }, 2000);
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
    isCloudConfigured: isCloudConfigured,
    getPublicBase: function () { return resolvePublicBase(); },
    getLastPullAt: function () { return lastPullAt; },
    schedulePullBurst: schedulePullBurst
  };
})(typeof window !== 'undefined' ? window : this);
