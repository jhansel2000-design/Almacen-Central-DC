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
  var lastRemoteUpdatedAt = '';
  var lastAppliedContentSig = '';
  var lastBurstAt = 0;
  var initReady = null;
  var broadcast = typeof global.BroadcastChannel !== 'undefined'
    ? new global.BroadcastChannel('averias-dc-live')
    : null;

  function contentSignature(snap) {
    if (!snap) return '';
    function rowSig(list) {
      return (list || []).map(function (r) {
        if (!r) return '';
        return String(r.id) + '@' + String(r.status || 'PENDIENTE').toUpperCase();
      }).sort().join('|');
    }
    return [
      rowSig(snap.incidences),
      rowSig(snap.damages),
      rowSig(snap.securityIncidents),
      rowSig(snap.audits5s),
      String((snap.equipmentInspections || []).length),
      Object.keys(snap.equipmentRegistry || {}).sort().join(',')
    ].join('~');
  }

  function snapshotSignature(snap) {
    return contentSignature(snap);
  }

  function applyCloudOverride(cfg) {
    cfg = cfg || {};
    var siteJb = cfg.averiasJsonBin;
    var siteHasSharedBin = !!(siteJb && siteJb.enabled && siteJb.binId && siteJb.accessKey);

    /* En GitHub Pages todos deben usar el MISMO bin del site-config, no bins locales del celular */
    if (isPublicHost() && siteHasSharedBin) {
      try {
        global.localStorage.removeItem(CLOUD_OVERRIDE_KEY);
      } catch (e) { /* noop */ }
      return cfg;
    }

    if (siteHasSharedBin) {
      return cfg;
    }

    try {
      var raw = global.localStorage.getItem(CLOUD_OVERRIDE_KEY);
      if (!raw) return cfg;
      var o = JSON.parse(raw);
      if (o && o.binId && o.accessKey) {
        cfg.averiasJsonBin = {
          enabled: true,
          binId: o.binId,
          accessKey: o.accessKey,
          keyType: 'master'
        };
        if (!cfg.pollSeconds) cfg.pollSeconds = 1;
        cfg.realtime = cfg.realtime !== false;
      }
    } catch (e) { /* noop */ }
    return cfg;
  }

  function getJsonBinConfig() {
    var jb = siteConfig && siteConfig.averiasJsonBin;
    if (!jb || !jb.enabled || !jb.binId || !jb.accessKey) return null;
    return jb;
  }

  function hasJsonBinConfig() {
    return !!getJsonBinConfig();
  }

  function hasFirebaseConfig() {
    if (global.PlatformFirebaseBridge && global.PlatformFirebaseBridge.isEnabled()) return true;
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
    if (firebaseDb && firebaseBound && hasFirebaseConfig()) return 10000;
    var sec = (siteConfig && siteConfig.pollSeconds) || 1;
    if (siteConfig && siteConfig.realtime === false) sec = 8;
    return Math.max(1, sec) * 1000;
  }

  function countSnapshotRecords(snap) {
    if (!snap) return 0;
    return (snap.incidences || []).length + (snap.damages || []).length +
      (snap.securityIncidents || []).length + (snap.audits5s || []).length +
      (snap.equipmentInspections || []).length;
  }

  function isEmptySnapshot(snap) {
    return countSnapshotRecords(snap) === 0 &&
      !Object.keys(snap && snap.equipmentRegistry || {}).length;
  }

  function mergeAveriasSnapshots(local, remote) {
    if (!remote) return local || EMPTY;
    if (!local) return remote;

    var Core = global.PlatformAveriasCore;

    function recordTime(r) {
      if (Core && Core.recordTimeForMerge) return Core.recordTimeForMerge(r);
      if (!r) return 0;
      return Date.parse(r.correctionDateIso) || Date.parse(r.correctionDate) || Date.parse(r.fechaRegistro) || Date.parse(r.fecha) ||
        Date.parse(r.reportDate) || (typeof r.id === 'number' ? r.id : parseInt(r.id, 10)) || 0;
    }

    function isCor(r) {
      if (Core && Core.isCorrectedStatus) return Core.isCorrectedStatus(r);
      return String(r && r.status || '').toUpperCase() === 'CORREGIDO';
    }

    function pickBetterRecord(a, b) {
      if (!a) return b;
      if (!b) return a;
      var aCor = isCor(a);
      var bCor = isCor(b);
      if (aCor && !bCor) return a;
      if (bCor && !aCor) return b;
      return recordTime(a) >= recordTime(b) ? a : b;
    }

    function mergeArr(a, b) {
      var map = {};
      (a || []).forEach(function (x, idx) {
        if (!x) return;
        if (x.id == null || x.id === '') x.id = 'legacy-a-' + idx + '-' + recordTime(x);
        var k = String(x.id);
        map[k] = map[k] ? pickBetterRecord(map[k], x) : x;
      });
      (b || []).forEach(function (x, idx) {
        if (!x) return;
        if (x.id == null || x.id === '') x.id = 'legacy-b-' + idx + '-' + recordTime(x);
        var k = String(x.id);
        map[k] = map[k] ? pickBetterRecord(map[k], x) : x;
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

  function applySnapshotToLocal(snap, silent, source) {
    if (!snap || !global.localStorage) return false;
    var current = getLocalSnapshot();
    if (current && source !== 'jsonbin') {
      snap = mergeAveriasSnapshots(current, snap);
    } else if (current && source === 'jsonbin') {
      snap = mergeAveriasSnapshots(snap, current);
    }
    var contentSig = contentSignature(snap);
    if (contentSig === lastAppliedContentSig) return false;
    var json = JSON.stringify(snap);
    var remoteAt = String(snap.updatedAt || '');
    try {
      global.localStorage.setItem(SNAPSHOT_KEY, json);
      global.localStorage.setItem('averias_dc_incidences', JSON.stringify(snap.incidences || []));
      global.localStorage.setItem('averias_dc_damages', JSON.stringify(snap.damages || []));
      global.localStorage.setItem('averias_dc_securityIncidents', JSON.stringify(snap.securityIncidents || []));
      global.localStorage.setItem('averias_dc_audits5s', JSON.stringify(snap.audits5s || []));
      global.localStorage.setItem('averias_dc_equipmentInspections', JSON.stringify(snap.equipmentInspections || []));
      global.localStorage.setItem('averias_dc_equipmentRegistry', JSON.stringify(snap.equipmentRegistry || {}));
      lastAppliedJson = json;
      lastRemoteUpdatedAt = remoteAt;
      lastAppliedContentSig = contentSig;
      var uiRefreshed = false;
      if (global.PlatformAveriasUI && global.PlatformAveriasUI.applyRemoteSnapshot) {
        uiRefreshed = global.PlatformAveriasUI.applyRemoteSnapshot(snap, { silent: !!silent });
      }
      if (!silent) {
        notifyUpdated('apply', { uiRefreshed: uiRefreshed, signature: contentSig });
      }
      updateLiveIndicator(true);
      return true;
    } catch (e) {
      return false;
    }
  }

  function notifyUpdated(source, extra) {
    try {
      var detail = Object.assign({ source: source || 'cloud' }, extra || {});
      global.dispatchEvent(new CustomEvent('averias-updated', { detail: detail }));
    } catch (e) { /* noop */ }
  }

  function broadcastSyncHint() {
    if (!broadcast) return;
    try {
      broadcast.postMessage({ type: 'averias-sync', at: Date.now() });
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

  function siteConfigUrl() {
    if (global.PlatformSecurity && global.PlatformSecurity.configUrl) {
      return global.PlatformSecurity.configUrl();
    }
    if (isPublicHost()) {
      return '/Almacen-Central-DC/data/site-config.json';
    }
    return 'data/site-config.json';
  }

  function loadSiteConfig() {
    return fetchJson(siteConfigUrl() + '?t=' + Date.now()).then(function (cfg) {
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
    if (!hasFirebaseConfig() || !global.PlatformFirebaseBridge) return Promise.resolve(false);
    return global.PlatformFirebaseBridge.ensureReady().then(function (db) {
      if (!db || firebaseBound) {
        if (db) firebaseDb = db;
        return !!db;
      }
      firebaseDb = db;
      firebaseBound = true;
      db.ref('averias/snapshot').on('value', function (snap) {
        var val = snap.val();
        if (!val) return;
        var merged = mergeAveriasSnapshots(getLocalSnapshot(), val);
        applySnapshotToLocal(merged);
      });
      return true;
    }).catch(function () { return false; });
  }

  function pullFromServer() {
    if (!canUseServerApi()) return Promise.resolve(null);
    return fetchJson(apiUrl('/api/data/averias')).then(function (res) {
      return res && res.data ? res.data : null;
    }).catch(function () { return null; });
  }

  function pullFromStatic() {
    if (hasJsonBinConfig()) return Promise.resolve(null);
    staticPollCounter += 1;
    var hasFastSource = isCloudConfigured() || canUseServerApi();
    if (hasFastSource && staticPollCounter % 3 !== 0) {
      return Promise.resolve(null);
    }
    return fetchJson(staticDataUrl() + '?t=' + Date.now()).catch(function () { return null; });
  }

  var lastJsonBinError = 0;
  var lastJsonBinOk = 0;

  function pullFromJsonBin() {
    var jb = getJsonBinConfig();
    if (!jb) return Promise.resolve(null);
    var url = 'https://api.jsonbin.io/v3/b/' + jb.binId + '/latest?t=' + Date.now();
    return global.fetch(url, {
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
      lastJsonBinOk = Date.now();
      var record = body && body.record ? body.record : null;
      if (record && body.metadata && body.metadata.createdAt && !record.updatedAt) {
        record.updatedAt = body.metadata.createdAt;
      }
      return record;
    }).catch(function () {
      lastJsonBinError = Date.now();
      return null;
    });
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
    var localBefore = getLocalSnapshot();
    return pullFromJsonBin().then(function (jsonBinSnap) {
      var tasks = [pullFromServer(), pullFromCloudProxy(), pullFromStatic(), pullFromFirebaseOnce()];
      return Promise.all(tasks).then(function (parts) {
        var merged = getLocalSnapshot() || EMPTY;
        if (jsonBinSnap) {
          merged = mergeAveriasSnapshots(merged, jsonBinSnap);
        }
        parts.forEach(function (part) {
          if (part) merged = mergeAveriasSnapshots(merged, part);
        });
        if (jsonBinSnap) {
          merged = mergeAveriasSnapshots(merged, jsonBinSnap);
        }
        if (merged) {
          var prevContentSig = contentSignature(getLocalSnapshot() || EMPTY);
          var applied = applySnapshotToLocal(merged, false, jsonBinSnap ? 'jsonbin' : 'merge');
          if (applied && contentSignature(merged) !== prevContentSig) {
            schedulePullBurst();
          }
          lastPullAt = Date.now();
          updateSyncStatusUi();
          if (hasJsonBinConfig()) {
            var remoteEmpty = !jsonBinSnap || isEmptySnapshot(jsonBinSnap);
            var localHas = localBefore && !isEmptySnapshot(localBefore);
            if (remoteEmpty && localHas) {
              var upload = mergeAveriasSnapshots(localBefore, merged);
              global.setTimeout(function () { pushSnapshot(upload, 2); }, 150);
            }
          }
        }
        return merged;
      });
    }).finally(function () {
      pulling = false;
    });
  }

  function schedulePullBurst() {
    var now = Date.now();
    if (now - lastBurstAt < 4000) return;
    lastBurstAt = now;
    [300, 900, 2000].forEach(function (ms) {
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
    var jb = getJsonBinConfig();
    if (!jb) return Promise.resolve(false);
    var headers = jsonBinAuthHeaders(jb);
    headers['Content-Type'] = 'application/json';
    return global.fetch('https://api.jsonbin.io/v3/b/' + jb.binId, {
      method: 'PUT',
      headers: headers,
      body: JSON.stringify(snap),
      mode: 'cors'
    }).then(function (res) {
      if (res.ok) {
        lastJsonBinOk = Date.now();
        return true;
      }
      lastJsonBinError = Date.now();
      return false;
    }).catch(function () {
      lastJsonBinError = Date.now();
      return false;
    });
  }

  function pushToFirebase(snap) {
    if (!global.PlatformFirebaseBridge) return Promise.resolve(false);
    var payload;
    try { payload = JSON.parse(JSON.stringify(snap || {})); } catch (e) { payload = snap; }
    return global.PlatformFirebaseBridge.ensureReady().then(function (adapter) {
      if (!adapter) return false;
      firebaseDb = adapter;
      return adapter.ref('averias/snapshot').set(payload).then(function (ok) { return !!ok; });
    }).catch(function () { return false; });
  }

  function pushSnapshot(snap, retries) {
    if (!snap) return Promise.resolve({ ok: false, reason: 'empty' });
    if (pushing) {
      return new Promise(function (resolve) {
        global.setTimeout(function () { resolve(pushSnapshot(snap, retries)); }, firebaseDb ? 80 : 200);
      });
    }
    pushing = true;
    retries = retries == null ? 3 : retries;
    snap.updatedAt = new Date().toISOString();

    function beginPush() {
      applySnapshotToLocal(snap, true);
      return attempt(0);
    }

    function attempt(n) {
      if (hasFirebaseConfig() && !hasJsonBinConfig()) {
        return pushToFirebase(snap).then(function (ok) {
          if (ok) {
            schedulePullBurst();
            broadcastSyncHint();
            notifyUpdated('push-ok');
            global.dispatchEvent(new CustomEvent('averias-sync-push', { detail: { ok: true } }));
            return { ok: true };
          }
          if (n < retries) {
            return new Promise(function (resolve) {
              global.setTimeout(function () { resolve(attempt(n + 1)); }, 120);
            });
          }
          return { ok: false, reason: 'firebase-fail' };
        });
      }
      return Promise.all([
        pushToServer(snap),
        pushToCloudProxy(snap),
        pushToJsonBin(snap),
        pushToFirebase(snap)
      ]).then(function (results) {
        var jsonBinOk = results[2];
        var ok = hasJsonBinConfig() ? !!jsonBinOk : results.some(Boolean);
        if (ok) {
          if (isLanHost()) {
            global.fetch('/api/publish-averias-live', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ data: snap })
            }).catch(function () { /* noop */ });
          }
          schedulePullBurst();
          broadcastSyncHint();
          notifyUpdated('push-ok');
          global.dispatchEvent(new CustomEvent('averias-sync-push', { detail: { ok: true } }));
          return { ok: true };
        }
        if (n < retries) {
          return new Promise(function (resolve) {
            global.setTimeout(function () { resolve(attempt(n + 1)); }, hasFirebaseConfig() && !hasJsonBinConfig() ? 120 : 400);
          });
        }
        return { ok: false, reason: hasJsonBinConfig() ? 'jsonbin-fail' : 'no-cloud' };
      });
    }

    if (hasJsonBinConfig() && isEmptySnapshot(snap)) {
      return pullFromJsonBin().then(function (remote) {
        if (remote && !isEmptySnapshot(remote)) {
          console.warn('[AveriasCloud] Push vacío bloqueado — la nube tiene reportes');
          applySnapshotToLocal(mergeAveriasSnapshots(remote, snap), false, 'jsonbin');
          return { ok: false, skipped: 'empty-would-wipe-remote' };
        }
        return beginPush();
      }).catch(function () {
        return beginPush();
      }).finally(function () {
        pushing = false;
      });
    }

    return beginPush().finally(function () {
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

  function startPolling() {
    clearInterval(pollSlowTimer);
    clearTimeout(pollTimer);
    function loop() {
      if (document.visibilityState === 'visible') {
        pullAll().finally(function () {
          pollTimer = global.setTimeout(loop, pollIntervalMs());
        });
      } else {
        pollTimer = global.setTimeout(loop, pollIntervalMs() * 2);
      }
    }
    pollTimer = global.setTimeout(loop, pollIntervalMs());
    pollSlowTimer = global.setInterval(function () {
      if (document.visibilityState === 'hidden') pullAll();
    }, 15000);
  }

  function isCloudConfigured() {
    return !!(
      hasJsonBinConfig() ||
      hasFirebaseConfig() ||
      (resolvePublicBase() && serverReachable) ||
      isLanHost() ||
      isPublicHost()
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

  function updateSyncStatusUi() {
    var el = global.document.getElementById('avSyncStatus');
    if (!el || el.hidden) return;
    if (hasFirebaseConfig()) {
      var ago = lastPullAt ? Math.round((Date.now() - lastPullAt) / 1000) : -1;
      var mode = global.PlatformFirebaseBridge && global.PlatformFirebaseBridge.getMode
        ? global.PlatformFirebaseBridge.getMode() : 'cloud';
      el.className = 'av-sync-status-line av-sync-status-ok';
      el.textContent = mode === 'rest'
        ? 'Sync en vivo (Firebase) · todos los celulares comparten reportes · hace ' + (ago >= 0 ? ago + ' s' : '—')
        : 'Sync automático · todos los dispositivos comparten datos · hace ' + (ago >= 0 ? ago + ' s' : '—');
      return;
    }
    var jb = getJsonBinConfig();
    if (!jb) {
      el.textContent = 'Conectando sync en la nube… recargue con Ctrl+F5 si tarda más de 5 s.';
      el.className = 'av-sync-status-line av-sync-status-warn';
      return;
    }
    var ago = lastPullAt ? Math.round((Date.now() - lastPullAt) / 1000) : -1;
    var recentErr = lastJsonBinError && (Date.now() - lastJsonBinError) < 15000;
    if (recentErr && ago > 15) {
      el.textContent = 'Problema de conexión con la nube. Compruebe internet y recargue (Ctrl+F5).';
      el.className = 'av-sync-status-line av-sync-status-err';
      return;
    }
    el.className = 'av-sync-status-line av-sync-status-ok';
    el.textContent = 'Sync automático · todos los dispositivos comparten datos · hace ' +
      (ago >= 0 ? ago + ' s' : '—');
  }

  function updateSyncUi() {
    var btn = global.document.getElementById('btnSyncAverias');
    if (btn) {
      var online = isCloudConfigured();
      btn.title = online
        ? 'En vivo (Firebase) — actualiza solo (~' + ((siteConfig && siteConfig.pollSeconds) || 1) + 's). No necesita JSONBin.'
        : 'Pulse para sincronizar — en GitHub Pages Firebase ya está activo';
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
    updateSyncStatusUi();
  }

  function activateCloud(masterKey) {
    var key = String(masterKey || '').trim();
    if (!key) return Promise.reject(new Error('Master Key requerida'));

    var sharedBin = getJsonBinConfig();
    if (sharedBin && isPublicHost()) {
      return pullAll().then(function () {
        var local = getLocalSnapshot() || EMPTY;
        return pushSnapshot(local).then(function () {
          return {
            ok: true,
            binId: sharedBin.binId,
            shared: true,
            hint: 'Usando nube compartida del sistema. Todos los dispositivos sincronizados.'
          };
        });
      });
    }

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
        if (!isPublicHost()) {
          try {
            global.localStorage.setItem(CLOUD_OVERRIDE_KEY, JSON.stringify({ binId: binId, accessKey: key }));
          } catch (e) { /* noop */ }
        }
        siteConfig = applyCloudOverride(siteConfig || {});
        if (!siteConfig.averiasJsonBin || !siteConfig.averiasJsonBin.binId) {
          siteConfig.averiasJsonBin = { enabled: true, binId: binId, accessKey: key, keyType: 'master' };
        }
        siteConfig.pollSeconds = 1;
        siteConfig.realtime = true;
        updateSyncUi();
        return pullAll().then(function () {
          return {
            ok: true,
            binId: siteConfig.averiasJsonBin.binId || binId,
            localOnly: !isPublicHost(),
            hint: isPublicHost()
              ? 'Nube compartida activa para todos los dispositivos.'
              : 'Activo en este dispositivo. Ejecute SETUP-AVERIAS-CLOUD.bat en el PC servidor.'
          };
        });
      });
    });
  }

  function init() {
    initReady = loadSiteConfig().then(function () {
      return initFirebase();
    }).then(function () {
      return probeCurrentServer().then(function () {
        updateSyncUi();
        return tryPromoteLocalCloudConfig();
      });
    }).then(function () {
      var local = getLocalSnapshot();
      if (local) {
        lastAppliedContentSig = contentSignature(local);
        lastAppliedJson = JSON.stringify(local);
        lastRemoteUpdatedAt = String(local.updatedAt || '');
      }
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
      global.addEventListener('firebase-connection', function () {
        updateSyncUi();
      });
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
      if (broadcast) {
        broadcast.onmessage = function (ev) {
          if (ev && ev.data && ev.data.type === 'averias-sync') {
            pullAll();
          }
        };
      }
      global.setInterval(function () {
        if (Date.now() - lastPullAt < 8000) updateLiveIndicator(true);
        else updateLiveIndicator(false);
      }, 2000);
    });
    return initReady;
  }

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  function wipeAll() {
    var snap = {
      version: 1,
      updatedAt: new Date().toISOString(),
      incidences: [],
      damages: [],
      securityIncidents: [],
      audits5s: [],
      equipmentInspections: [],
      equipmentRegistry: {}
    };
    var keys = [
      SNAPSHOT_KEY,
      'averias_dc_incidences',
      'averias_dc_damages',
      'averias_dc_securityIncidents',
      'averias_dc_audits5s',
      'averias_dc_equipmentInspections',
      'averias_dc_equipmentRegistry',
      'averias_dc_audit_log'
    ];
    keys.forEach(function (k) {
      try { global.localStorage.removeItem(k); } catch (e) { /* noop */ }
    });
    try {
      global.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
      global.localStorage.setItem('averias_dc_incidences', '[]');
      global.localStorage.setItem('averias_dc_damages', '[]');
      global.localStorage.setItem('averias_dc_securityIncidents', '[]');
      global.localStorage.setItem('averias_dc_audits5s', '[]');
      global.localStorage.setItem('averias_dc_equipmentInspections', '[]');
      global.localStorage.setItem('averias_dc_equipmentRegistry', '{}');
    } catch (e) { /* noop */ }
    lastAppliedJson = '';
    lastAppliedContentSig = '';
    lastRemoteUpdatedAt = '';
    if (global.PlatformAveriasUI && global.PlatformAveriasUI.applyRemoteSnapshot) {
      global.PlatformAveriasUI.applyRemoteSnapshot(snap, { silent: false });
    }
    pushing = true;
    return Promise.all([
      pushToServer(snap),
      pushToCloudProxy(snap),
      pushToJsonBin(snap),
      pushToFirebase(snap)
    ]).then(function (results) {
      var jsonBinOk = results[2];
      var ok = hasJsonBinConfig() ? !!jsonBinOk : results.some(Boolean);
      if (ok) {
        broadcastSyncHint();
        schedulePullBurst();
      }
      notifyUpdated('wipe');
      try {
        global.dispatchEvent(new CustomEvent('averias-web-wiped'));
      } catch (e) { /* noop */ }
      return { ok: ok, jsonBinOk: jsonBinOk };
    }).finally(function () {
      pushing = false;
    });
  }

  global.PlatformAveriasCloudSync = {
    mergeAveriasSnapshots: mergeAveriasSnapshots,
    contentSignature: contentSignature,
    countSnapshotRecords: countSnapshotRecords,
    pull: pullAll,
    push: pushSnapshot,
    wipeAll: wipeAll,
    isCloudConfigured: isCloudConfigured,
    activateCloud: activateCloud,
    getPublicBase: function () { return resolvePublicBase(); },
    getLastPullAt: function () { return lastPullAt; },
    schedulePullBurst: schedulePullBurst,
    ready: function () { return initReady || Promise.resolve(); }
  };
})(typeof window !== 'undefined' ? window : this);
