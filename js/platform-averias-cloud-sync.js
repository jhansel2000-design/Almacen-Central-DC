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
  var CLOUD_OVERRIDE_KEY = 'averias_cloud_jsonbin_override';
  var serverReachable = false;
  var siteConfigPollTimer = null;

  function applyCloudOverride(cfg) {
    cfg = cfg || {};
    try {
      var raw = global.localStorage.getItem(CLOUD_OVERRIDE_KEY);
      if (!raw) return cfg;
      var o = JSON.parse(raw);
      if (o && o.binId && o.accessKey) {
        cfg.averiasJsonBin = {
          enabled: true,
          binId: o.binId,
          accessKey: o.accessKey
        };
        if (!cfg.pollSeconds) cfg.pollSeconds = 2;
        cfg.realtime = cfg.realtime !== false;
      }
    } catch (e) { /* noop */ }
    return cfg;
  }

  function hasJsonBinConfig() {
    var jb = siteConfig && siteConfig.averiasJsonBin;
    return !!(jb && jb.enabled && jb.binId && jb.accessKey);
  }

  function hasFirebaseConfig() {
    var fb = siteConfig && siteConfig.firebase;
    return !!(fb && fb.enabled && fb.databaseURL);
  }

  function pullFromCloudProxy() {
    if (!canUseServerApi() || !serverReachable) return Promise.resolve(null);
    return fetchJson(apiUrl('/api/cloud/averias')).then(function (res) {
      return res && res.data ? res.data : null;
    }).catch(function () { return null; });
  }

  function pushToCloudProxy(snap) {
    if (!canUseServerApi() || !serverReachable) return Promise.resolve(false);
    return global.fetch(apiUrl('/api/cloud/averias'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: snap })
    }).then(function (res) { return res.ok; }).catch(function () { return false; });
  }

  function tryPromoteLocalCloudConfig() {
    if (!canUseServerApi() || !serverReachable) return Promise.resolve(false);
    var raw;
    try { raw = global.localStorage.getItem(CLOUD_OVERRIDE_KEY); } catch (e) { return Promise.resolve(false); }
    if (!raw || hasJsonBinConfig()) return Promise.resolve(false);
    var o;
    try { o = JSON.parse(raw); } catch (e) { return Promise.resolve(false); }
    if (!o || !o.binId || !o.accessKey) return Promise.resolve(false);
    return global.fetch(apiUrl('/api/register-jsonbin-config'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ binId: o.binId, accessKey: o.accessKey })
    }).then(function (res) { return res.json(); }).then(function (data) {
      if (data && data.ok) {
        try { global.localStorage.removeItem(CLOUD_OVERRIDE_KEY); } catch (e) { /* noop */ }
        return loadSiteConfig().then(function () {
          updateSyncUi();
          return true;
        });
      }
      return false;
    }).catch(function () { return false; });
  }

  function pollIntervalMs() {
    var sec = (siteConfig && siteConfig.pollSeconds) || 1;
    if (siteConfig && siteConfig.realtime === false) sec = 8;
    return Math.max(1, sec) * 1000;
  }

  function mergeAveriasSnapshots(local, remote) {
    if (!remote) return local || EMPTY;
    if (!local) return remote;

    function recordTime(r) {
      if (!r) return 0;
      return Date.parse(r.correctionDate) || Date.parse(r.fechaRegistro) || Date.parse(r.fecha) ||
        Date.parse(r.reportDate) || (typeof r.id === 'number' ? r.id : parseInt(r.id, 10)) || 0;
    }

    function pickBetterRecord(a, b) {
      if (!a) return b;
      if (!b) return a;
      if (a.status === 'CORREGIDO' && b.status !== 'CORREGIDO') return a;
      if (b.status === 'CORREGIDO' && a.status !== 'CORREGIDO') return b;
      return recordTime(a) >= recordTime(b) ? a : b;
    }

    function mergeArr(a, b) {
      var map = {};
      (a || []).forEach(function (x) {
        if (x && x.id != null) {
          var k = String(x.id);
          map[k] = map[k] ? pickBetterRecord(map[k], x) : x;
        }
      });
      (b || []).forEach(function (x) {
        if (x && x.id != null) {
          var k = String(x.id);
          map[k] = map[k] ? pickBetterRecord(map[k], x) : x;
        }
      });
      return Object.keys(map).map(function (k) { return map[k]; })
        .sort(function (x, y) { return (y.id || 0) - (x.id || 0); });
    }

    function mergeEquipmentRegistry(lReg, rReg) {
      var keys = {};
      var out = {};
      Object.keys(lReg || {}).forEach(function (k) { keys[k] = true; });
      Object.keys(rReg || {}).forEach(function (k) { keys[k] = true; });
      Object.keys(keys).forEach(function (k) {
        var l = lReg && lReg[k];
        var r = rReg && rReg[k];
        if (!l) { out[k] = r; return; }
        if (!r) { out[k] = l; return; }
        if (l.estado === 'DISPONIBLE' && r.estado === 'NO_DISPONIBLE') { out[k] = l; return; }
        if (r.estado === 'DISPONIBLE' && l.estado === 'NO_DISPONIBLE') { out[k] = r; return; }
        var lt = Date.parse(l.ultimaActualizacion) || 0;
        var rt = Date.parse(r.ultimaActualizacion) || 0;
        out[k] = lt >= rt ? l : r;
      });
      return out;
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
      equipmentRegistry: mergeEquipmentRegistry(local.equipmentRegistry, remote.equipmentRegistry)
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

  function parseJsonText(text) {
    if (text && text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    return JSON.parse(text);
  }

  function isJsonBinMasterKey(key) {
    return /^\$2[ab]\$/.test(String(key || ''));
  }

  function jsonBinAuthHeaders(jb) {
    var key = jb && jb.accessKey;
    if (!key) return {};
    if (jb.keyType === 'master' || jb.useMasterKey || isJsonBinMasterKey(key)) {
      return { 'X-Master-Key': key };
    }
    return { 'X-Access-Key': key };
  }

  function fetchJson(url, opts) {
    opts = opts || {};
    return global.fetch(url, Object.assign({ cache: 'no-store', mode: 'cors' }, opts)).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text().then(parseJsonText);
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
      siteConfig = applyCloudOverride(cfg || {});
      applySiteConfigRelay();
      publicBase = normalizeBase(siteConfig.publicSyncBaseUrl) || publicBase;
      return siteConfig;
    }).catch(function () {
      siteConfig = applyCloudOverride(siteConfig || {});
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
      headers: jsonBinAuthHeaders(jb),
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
      pullFromCloudProxy(),
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
    var headers = jsonBinAuthHeaders(jb);
    headers['Content-Type'] = 'application/json';
    return global.fetch('https://api.jsonbin.io/v3/b/' + jb.binId, {
      method: 'PUT',
      headers: headers,
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
        pushToCloudProxy(snap),
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
    return !!(
      hasJsonBinConfig() ||
      hasFirebaseConfig() ||
      (resolvePublicBase() && serverReachable) ||
      isLanHost()
    );
  }

  function probeCurrentServer() {
    if (isLanHost()) {
      return fetchJson('/api/health').then(function (h) {
        serverReachable = !!(h && h.ok);
        return serverReachable;
      }).catch(function () {
        serverReachable = false;
        return false;
      });
    }
    var base = resolvePublicBase();
    if (!base) {
      serverReachable = false;
      return Promise.resolve(false);
    }
    return probeServerBase(base).then(function (alive) {
      serverReachable = !!alive;
      if (!alive && siteConfig && siteConfig.publicSyncBaseUrl) {
        publicBase = '';
      }
      return serverReachable;
    });
  }

  function startSiteConfigRefresh() {
    clearInterval(siteConfigPollTimer);
    if (!isPublicHost()) return;
    siteConfigPollTimer = global.setInterval(function () {
      loadSiteConfig().then(function () {
        updateSyncUi();
        if (hasJsonBinConfig() || (resolvePublicBase() && serverReachable)) {
          pullAll();
        }
      });
    }, 45000);
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
        : 'Sin nube — active sincronización cloud para compartir entre celulares';
      btn.classList.toggle('cloud-active', online);
    }
    var banner = global.document.getElementById('avSyncBanner');
    if (banner) {
      banner.hidden = isCloudConfigured();
    }
    var activateBtn = global.document.getElementById('btnActivateCloud');
    if (activateBtn) {
      activateBtn.hidden = isCloudConfigured();
    }
    var live = global.document.getElementById('avSyncLive');
    if (live) {
      live.hidden = !isCloudConfigured();
    }
  }

  function activateCloud(masterKey) {
    var key = String(masterKey || '').trim();
    if (!key) return Promise.reject(new Error('Master Key requerida'));

    if (canUseServerApi()) {
      return global.fetch(apiUrl('/api/setup-averias-cloud'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ masterKey: key })
      }).then(function (res) {
        return res.json();
      }).then(function (data) {
        if (!data || !data.ok) throw new Error((data && data.error) || 'No se pudo activar la nube');
        try {
          global.localStorage.removeItem(CLOUD_OVERRIDE_KEY);
        } catch (e) { /* noop */ }
        return loadSiteConfig().then(function () {
          updateSyncUi();
          return pullAll();
        }).then(function () {
          return data;
        });
      });
    }

    var payload = JSON.stringify(EMPTY);
    return global.fetch('https://api.jsonbin.io/v3/b', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': key,
        'X-Bin-Name': 'Almacen-Central-DC-Averias'
      },
      body: payload,
      mode: 'cors'
    }).then(function (res) {
      return res.json().then(function (body) {
        if (!res.ok) throw new Error((body && body.message) || 'Error JSONBin');
        var binId = body.metadata && body.metadata.id;
        if (!binId) throw new Error('JSONBin no devolvió binId');
        try {
          global.localStorage.setItem(CLOUD_OVERRIDE_KEY, JSON.stringify({ binId: binId, accessKey: key }));
        } catch (e) { /* noop */ }
        siteConfig = applyCloudOverride(siteConfig || {});
        siteConfig.averiasJsonBin = { enabled: true, binId: binId, accessKey: key };
        siteConfig.pollSeconds = 2;
        siteConfig.realtime = true;
        updateSyncUi();
        return pullAll().then(function () {
          return {
            ok: true,
            binId: binId,
            localOnly: true,
            hint: 'Activo solo en este celular. En el PC servidor ejecute SETUP-AVERIAS-CLOUD.bat para que todos lo vean.'
          };
        });
      });
    });
  }

  function init() {
    return loadSiteConfig().then(function () {
      return initFirebase();
    }).then(function () {
      return probeCurrentServer().then(function () {
        updateSyncUi();
        return tryPromoteLocalCloudConfig();
      });
    }).then(function () {
      return pullAll();
    }).then(function () {
      startPolling();
      startSSE();
      startSiteConfigRefresh();
      global.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') {
          pullAll();
          startSSE();
        }
      }, { passive: true });
      global.addEventListener('focus', function () { pullAll(); }, { passive: true });
      document.addEventListener('lan-ready', function () {
        publicBase = resolvePublicBase();
        probeCurrentServer().then(function () {
          pullAll();
          startSSE();
          updateSyncUi();
          tryPromoteLocalCloudConfig();
        });
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
    activateCloud: activateCloud,
    getPublicBase: function () { return resolvePublicBase(); },
    getLastPullAt: function () { return lastPullAt; },
    schedulePullBurst: schedulePullBurst
  };
})(typeof window !== 'undefined' ? window : this);
