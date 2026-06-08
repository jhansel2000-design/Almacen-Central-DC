/**
 * Sincronización LAN — comparte datos entre dispositivos del mismo WiFi
 * Requiere server/lan-server.js (API + SSE en tiempo real)
 */
(function (global) {
  'use strict';

  var ENABLED = false;
  var applyingRemote = false;
  var pushTimers = {};
  var eventSource = null;
  var serverInfo = null;

  var STORE_TO_LS = {
    operaciones: 'almacen_platform_data_operaciones',
    productividad: 'almacen_platform_data_productividad',
    facturas: 'almacen_platform_data_facturas',
    despacho: 'almacen_platform_data_despacho',
    config: 'almacen_platform_config',
    users: 'almacen_users',
    areas: 'almacen_areas',
    logs: 'almacen_logs',
    accessRequests: 'almacen_access_requests'
  };

  var LS_TO_STORE = {};
  Object.keys(STORE_TO_LS).forEach(function (store) {
    LS_TO_STORE[STORE_TO_LS[store]] = store;
  });

  function getUpdatedAt(obj) {
    if (!obj) return 0;
    if (obj.updatedAt) return Date.parse(obj.updatedAt) || 0;
    if (Array.isArray(obj) && obj[0] && obj[0].at) return Date.parse(obj[0].at) || 0;
    return 0;
  }

  function apiFetch(path, opts) {
    opts = opts || {};
    return fetch(path, {
      method: opts.method || 'GET',
      headers: Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {}),
      body: opts.body != null ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (j) {
          throw new Error(j.error || ('HTTP ' + res.status));
        });
      }
      return res.json();
    });
  }

  function applyRemote(lsKey, data, store) {
    if (!global.localStorage) return;
    applyingRemote = true;
    try {
      localStorage.setItem(lsKey, JSON.stringify(data));
    } finally {
      applyingRemote = false;
    }
    if (store === 'despacho') {
      try {
        global.dispatchEvent(new CustomEvent('despacho-updated', {
          detail: { data: data, at: new Date().toISOString(), source: 'lan' }
        }));
      } catch (e) { /* noop */ }
    }
    try {
      global.dispatchEvent(new CustomEvent('lan-sync', {
        detail: { store: store, lsKey: lsKey, source: 'lan' }
      }));
    } catch (e) { /* noop */ }
  }

  function pushToServer(lsKey, rawValue) {
    var store = LS_TO_STORE[lsKey];
    if (!ENABLED || !store || applyingRemote) return;
    clearTimeout(pushTimers[store]);
    pushTimers[store] = setTimeout(function () {
      var data;
      try { data = JSON.parse(rawValue); } catch (e) { return; }
      apiFetch('/api/data/' + store, {
        method: 'PUT',
        body: { data: data, source: 'client' }
      }).catch(function (err) {
        console.warn('[LAN] Error al subir ' + store + ':', err.message);
      });
    }, 350);
  }

  function hookLocalStorage() {
    if (!global.localStorage || global.localStorage.__lanHooked) return;
    var proto = Storage.prototype;
    var origSet = proto.setItem;
    proto.setItem = function (key, value) {
      origSet.call(this, key, value);
      if (ENABLED && LS_TO_STORE[key]) {
        pushToServer(key, value);
      }
    };
    global.localStorage.__lanHooked = true;
  }

  function getLocalStoreTime(lsKey) {
    if (!global.localStorage) return 0;
    if (lsKey === STORE_TO_LS.users) {
      var ts = localStorage.getItem(lsKey + '_sync');
      if (ts) return parseInt(ts, 10) || 0;
    }
    return 0;
  }

  function applyUsersMerge(local, remote) {
    if (!global.PlatformAdmin || !global.PlatformAdmin.mergeUserRegistries) {
      return remote || local;
    }
    return global.PlatformAdmin.mergeUserRegistries(local, remote);
  }

  function mergeOnConnect(serverPayload) {
    var stores = (serverPayload && serverPayload.stores) || {};
    Object.keys(STORE_TO_LS).forEach(function (store) {
      var lsKey = STORE_TO_LS[store];
      var remoteWrap = stores[store];
      var remote = remoteWrap && remoteWrap.data;
      var localRaw = global.localStorage ? localStorage.getItem(lsKey) : null;
      var local = null;
      try { local = localRaw ? JSON.parse(localRaw) : null; } catch (e) { local = null; }

      if (!remote && local) {
        pushToServer(lsKey, localRaw);
      } else if (remote && !local) {
        applyRemote(lsKey, remote, store);
      } else if (remote && local) {
        if (store === 'users') {
          var mergedUsers = applyUsersMerge(local, remote);
          applyRemote(lsKey, mergedUsers, store);
          pushToServer(lsKey, JSON.stringify(mergedUsers));
        } else {
          var rTime = remoteWrap.mtime || getUpdatedAt(remote);
          var lTime = getUpdatedAt(local) || getLocalStoreTime(lsKey);
          if (rTime >= lTime) {
            applyRemote(lsKey, remote, store);
          } else {
            pushToServer(lsKey, localRaw);
          }
        }
      }
      if (store === 'users' && global.PlatformAdmin && global.PlatformAdmin.forceSyncPrimaryCredentials) {
        global.PlatformAdmin.forceSyncPrimaryCredentials();
      }
    });
  }

  function startSSE() {
    if (eventSource) {
      try { eventSource.close(); } catch (e) { /* noop */ }
    }
    if (!global.EventSource) return;
    eventSource = new EventSource('/api/events');
    eventSource.addEventListener('update', function (ev) {
      var payload;
      try { payload = JSON.parse(ev.data); } catch (e) { return; }
      if (!payload || !payload.store) return;
      apiFetch('/api/data/' + payload.store).then(function (res) {
        if (res && res.data != null) {
          var lsKey = STORE_TO_LS[payload.store];
          var merged = res.data;
          if (payload.store === 'users' && global.localStorage && global.PlatformAdmin) {
            var localRaw = localStorage.getItem(lsKey);
            var local = null;
            try { local = localRaw ? JSON.parse(localRaw) : null; } catch (e) { local = null; }
            merged = applyUsersMerge(local, res.data);
          }
          applyRemote(lsKey, merged, payload.store);
          if (payload.store === 'users' && global.PlatformAdmin && global.PlatformAdmin.forceSyncPrimaryCredentials) {
            global.PlatformAdmin.forceSyncPrimaryCredentials();
          }
        }
      }).catch(function () { /* ignore */ });
    });
    eventSource.onerror = function () {
      /* EventSource reconecta solo */
    };
  }

  function showLanBadge() {
    if (document.getElementById('lanSyncBadge')) return;
    var badge = document.createElement('span');
    badge.id = 'lanSyncBadge';
    badge.className = 'chip-live lan-sync-badge';
    badge.title = 'Datos compartidos en red local';
    badge.textContent = 'LAN';
    var host = document.querySelector('.topbar-actions') || document.querySelector('.desp-topbar-actions');
    if (host) host.insertBefore(badge, host.firstChild);
  }

  function init() {
    apiFetch('/api/health').then(function (health) {
      if (!health || !health.ok) return;
      ENABLED = true;
      serverInfo = health;
      hookLocalStorage();
      return apiFetch('/api/data').then(function (all) {
        mergeOnConnect(all);
        startSSE();
        showLanBadge();
        if (global.PlatformToast) {
          var ip = (health.ips && health.ips[0] && health.ips[0].address) || 'red local';
          global.PlatformToast.info('Modo LAN activo · datos compartidos (' + ip + ')', 5000);
        }
        try {
          global.dispatchEvent(new CustomEvent('lan-ready', { detail: health }));
        } catch (e) { /* noop */ }
      });
    }).catch(function () {
      /* Sin servidor LAN: modo local normal (localStorage) */
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.PlatformLanSync = {
    isEnabled: function () { return ENABLED; },
    getServerInfo: function () { return serverInfo; },
    forcePull: function () {
      if (!ENABLED) return Promise.resolve(false);
      return apiFetch('/api/data').then(function (all) {
        mergeOnConnect(all);
        return true;
      });
    }
  };
})(typeof window !== 'undefined' ? window : this);
