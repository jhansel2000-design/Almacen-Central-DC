/**
 * Firebase RTDB — SDK WebSocket + REST (REST funciona aunque la API key falle)
 */
(function (global) {
  'use strict';

  var readyPromise = null;
  var db = null;
  var fbConfig = null;
  var connected = false;
  var restMode = false;
  var sdkFailed = false;
  var pollers = {};
  var lastPollSig = {};
  var pollMs = 500;

  function siteConfigUrl() {
    if (global.PlatformSecurity && global.PlatformSecurity.configUrl) {
      return global.PlatformSecurity.configUrl();
    }
    try {
      var h = global.location.hostname || '';
      if (h.indexOf('github.io') >= 0) return '/Almacen-Central-DC/data/site-config.json';
    } catch (e) { /* noop */ }
    return 'data/site-config.json';
  }

  function dispatchConnection() {
    try {
      global.dispatchEvent(new CustomEvent('firebase-connection', {
        detail: {
          connected: connected,
          mode: restMode ? 'rest' : 'sdk',
          at: new Date().toISOString()
        }
      }));
    } catch (e) { /* noop */ }
  }

  function sanitize(data) {
    try {
      return JSON.parse(JSON.stringify(data || {}));
    } catch (err) {
      return {};
    }
  }

  function restUrl(path) {
    var base = String(fbConfig.databaseURL || '').replace(/\/+$/, '');
    var clean = String(path || '').replace(/^\//, '');
    return base + '/' + clean + '.json';
  }

  function restPush(path, data) {
    if (!fbConfig || !fbConfig.databaseURL) return Promise.resolve(false);
    return global.fetch(restUrl(path), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sanitize(data)),
      cache: 'no-store',
      mode: 'cors'
    }).then(function (res) {
      if (res.ok) {
        connected = true;
        restMode = true;
        dispatchConnection();
        return true;
      }
      console.warn('[FirebaseBridge] REST push HTTP', res.status, path);
      return false;
    }).catch(function (err) {
      console.warn('[FirebaseBridge] REST push error:', err && err.message ? err.message : err);
      return false;
    });
  }

  function restPull(path) {
    if (!fbConfig || !fbConfig.databaseURL) return Promise.resolve(null);
    return global.fetch(restUrl(path) + '?t=' + Date.now(), {
      cache: 'no-store',
      mode: 'cors'
    }).then(function (res) {
      if (!res.ok) return null;
      return res.json();
    }).catch(function () {
      return null;
    });
  }

  function makeSnap(val) {
    return {
      val: function () { return val; },
      exists: function () { return val != null; }
    };
  }

  function startRestPoll(path, callback) {
    if (pollers[path]) return;
    function tick() {
      restPull(path).then(function (val) {
        if (val == null) return;
        connected = true;
        restMode = true;
        var sig;
        try { sig = JSON.stringify(val); } catch (e) { sig = String(Date.now()); }
        if (sig !== lastPollSig[path]) {
          lastPollSig[path] = sig;
          callback(makeSnap(val));
        }
        dispatchConnection();
      });
    }
    tick();
    pollers[path] = global.setInterval(tick, pollMs);
  }

  function makeRef(path) {
    return {
      set: function (data) {
        if (db && !sdkFailed) {
          return db.ref(path).set(sanitize(data)).then(function () {
            connected = true;
            dispatchConnection();
            return true;
          }).catch(function (err) {
            console.warn('[FirebaseBridge] SDK set failed, REST fallback:', err && err.message ? err.message : err);
            return restPush(path, data);
          });
        }
        return restPush(path, data);
      },
      on: function (event, callback) {
        if (event !== 'value' || typeof callback !== 'function') return;
        if (db && !sdkFailed) {
          db.ref(path).on('value', function (snap) {
            connected = true;
            restMode = false;
            dispatchConnection();
            callback(snap);
          }, function (err) {
            console.warn('[FirebaseBridge] SDK listener error, REST poll:', err && err.message ? err.message : err);
            sdkFailed = true;
            startRestPoll(path, callback);
          });
        } else {
          startRestPoll(path, callback);
        }
      },
      once: function (event) {
        if (event !== 'value') return Promise.resolve(makeSnap(null));
        if (db && !sdkFailed) {
          return db.ref(path).once('value').then(function (snap) {
            connected = true;
            return snap;
          }).catch(function () {
            return restPull(path).then(function (val) { return makeSnap(val); });
          });
        }
        return restPull(path).then(function (val) { return makeSnap(val); });
      }
    };
  }

  function makeDbAdapter() {
    return {
      ref: function (path) { return makeRef(path); },
      goOnline: function () {
        try { if (db && db.goOnline) db.goOnline(); } catch (e) { /* noop */ }
      }
    };
  }

  function waitForSdk(maxMs) {
    maxMs = maxMs || 8000;
    return new Promise(function (resolve) {
      if (global.firebase && global.firebase.database) return resolve(true);
      var started = Date.now();
      var timer = global.setInterval(function () {
        if (global.firebase && global.firebase.database) {
          global.clearInterval(timer);
          resolve(true);
          return;
        }
        if (Date.now() - started >= maxMs) {
          global.clearInterval(timer);
          resolve(false);
        }
      }, 60);
    });
  }

  function loadFirebaseConfig() {
    if (fbConfig) return Promise.resolve(fbConfig);
    return global.fetch(siteConfigUrl() + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('site-config HTTP ' + res.status);
        return res.json();
      })
      .then(function (cfg) {
        fbConfig = cfg && cfg.firebase ? cfg.firebase : null;
        if (cfg && cfg.syncTargetMs) {
          pollMs = Math.max(400, Math.min(1200, parseInt(cfg.syncTargetMs, 10) || 500));
        }
        return fbConfig;
      });
  }

  function tryInitSdk() {
    if (!fbConfig || !fbConfig.databaseURL || !fbConfig.apiKey) return Promise.resolve(false);
    return waitForSdk().then(function (ok) {
      if (!ok || !global.firebase) {
        sdkFailed = true;
        return false;
      }
      try {
        if (!global.firebase.apps.length) {
          global.firebase.initializeApp({
            apiKey: fbConfig.apiKey,
            authDomain: fbConfig.authDomain,
            databaseURL: fbConfig.databaseURL,
            projectId: fbConfig.projectId
          });
        }
        db = global.firebase.database();
        try { db.goOnline(); } catch (e) { /* noop */ }
        db.ref('.info/connected').on('value', function (snap) {
          if (snap.val() === true) {
            connected = true;
            restMode = false;
            sdkFailed = false;
            dispatchConnection();
          }
        });
        global.setTimeout(function () {
          if (!connected && fbConfig && fbConfig.databaseURL) {
            sdkFailed = true;
            restMode = true;
            connected = true;
            dispatchConnection();
          }
        }, 4000);
        return true;
      } catch (err) {
        console.warn('[FirebaseBridge] SDK init error:', err);
        sdkFailed = true;
        return false;
      }
    });
  }

  function ensureReady() {
    if (readyPromise) return readyPromise;
    readyPromise = loadFirebaseConfig().then(function (fb) {
      if (!fb || !fb.enabled || !fb.databaseURL) return null;
      restMode = true;
      connected = true;
      dispatchConnection();
      return tryInitSdk().then(function () {
        return makeDbAdapter();
      });
    }).catch(function (err) {
      console.warn('[FirebaseBridge] config error:', err);
      return null;
    });
    return readyPromise;
  }

  global.PlatformFirebaseBridge = {
    ensureReady: ensureReady,
    getDb: function () { return db ? makeDbAdapter() : (fbConfig && fbConfig.enabled ? makeDbAdapter() : null); },
    isConnected: function () { return connected; },
    isRestMode: function () { return restMode; },
    getMode: function () { return restMode ? 'rest' : 'sdk'; },
    isEnabled: function () { return !!(fbConfig && fbConfig.enabled && fbConfig.databaseURL); },
    push: restPush,
    pull: restPull,
    ref: function (path) { return makeRef(path); }
  };
})(typeof window !== 'undefined' ? window : this);
