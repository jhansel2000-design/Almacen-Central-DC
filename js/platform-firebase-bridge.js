/**
 * Inicialización robusta de Firebase RTDB (móvil + PC + GitHub Pages)
 */
(function (global) {
  'use strict';

  var readyPromise = null;
  var db = null;
  var fbConfig = null;
  var connected = false;

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

  function waitForSdk(maxMs) {
    maxMs = maxMs || 12000;
    return new Promise(function (resolve) {
      if (global.firebase && global.firebase.database) return resolve(!!global.firebase);
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
      }, 80);
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
        return fbConfig;
      });
  }

  function ensureReady() {
    if (db) return Promise.resolve(db);
    if (readyPromise) return readyPromise;
    readyPromise = loadFirebaseConfig().then(function (fb) {
      if (!fb || !fb.enabled || !fb.databaseURL) return null;
      return waitForSdk().then(function (ok) {
        if (!ok || !global.firebase) {
          console.warn('[FirebaseBridge] SDK no disponible');
          return null;
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
          db = global.firebase.database();
          try { db.goOnline(); } catch (e) { /* noop */ }
          db.ref('.info/connected').on('value', function (snap) {
            connected = snap.val() === true;
            try {
              global.dispatchEvent(new CustomEvent('firebase-connection', {
                detail: { connected: connected, at: new Date().toISOString() }
              }));
            } catch (e) { /* noop */ }
          });
          return db;
        } catch (err) {
          console.warn('[FirebaseBridge] init error:', err);
          return null;
        }
      });
    }).catch(function (err) {
      console.warn('[FirebaseBridge] config error:', err);
      return null;
    });
    return readyPromise;
  }

  global.PlatformFirebaseBridge = {
    ensureReady: ensureReady,
    getDb: function () { return db; },
    isConnected: function () { return connected; },
    isEnabled: function () { return !!(fbConfig && fbConfig.enabled && fbConfig.databaseURL); },
    ref: function (path) {
      return db ? db.ref(path) : null;
    }
  };
})(typeof window !== 'undefined' ? window : this);
