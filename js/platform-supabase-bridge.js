/**
 * Puente Supabase — sync central de TODA la web (WMS, averías, despacho, inventario)
 */
(function (global) {
  'use strict';

  var TABLE = 'web_snapshots';
  var channels = {};
  var boundModules = {};

  function sb() {
    return global.PlatformSupabase && global.PlatformSupabase.getClient();
  }

  function isEnabled() {
    return !!(global.PlatformSupabase && global.PlatformSupabase.isEnabled());
  }

  function isPrimary() {
    if (!isEnabled()) return false;
    var cfg = global.PlatformSupabase.getConfig && global.PlatformSupabase.getConfig();
    var sbCfg = cfg && cfg.supabase;
    if (sbCfg && sbCfg.primary === false) return false;
    return true;
  }

  function sanitize(data) {
    try { return JSON.parse(JSON.stringify(data || {})); } catch (e) { return data || {}; }
  }

  function ensureReady() {
    if (!global.PlatformSupabase) return Promise.resolve(null);
    return global.PlatformSupabase.init().then(function () {
      return isEnabled() ? sb() : null;
    });
  }

  function pull(moduleKey) {
    if (!moduleKey) return Promise.resolve(null);
    return ensureReady().then(function (client) {
      if (!client) return null;
      return client.from(TABLE)
        .select('data, updated_at')
        .eq('module', moduleKey)
        .maybeSingle()
        .then(function (res) {
          if (res.error || !res.data) return null;
          return res.data.data || null;
        })
        .catch(function () { return null; });
    });
  }

  function push(moduleKey, data) {
    if (!moduleKey || !data) return Promise.resolve(false);
    return ensureReady().then(function (client) {
      if (!client) return false;
      var row = {
        module: moduleKey,
        data: sanitize(data),
        updated_at: new Date().toISOString()
      };
      return client.from(TABLE)
        .upsert(row, { onConflict: 'module' })
        .then(function (res) {
          var ok = !res.error;
          if (ok && global.PlatformSupabase.testConnection) {
            global.PlatformSupabase.testConnection();
          }
          return ok;
        })
        .catch(function () { return false; });
    });
  }

  function subscribe(moduleKey, callback) {
    if (!moduleKey || typeof callback !== 'function') return function () {};
    boundModules[moduleKey] = callback;
    return ensureReady().then(function (client) {
      if (!client) return function () {};
      if (channels[moduleKey]) {
        try { client.removeChannel(channels[moduleKey]); } catch (e) { /* noop */ }
      }
      channels[moduleKey] = client.channel('web_snap_' + moduleKey)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: TABLE,
          filter: 'module=eq.' + moduleKey
        }, function () {
          pull(moduleKey).then(function (data) {
            if (data) callback(data);
          });
        })
        .subscribe();
      return function () {
        try {
          if (channels[moduleKey]) client.removeChannel(channels[moduleKey]);
          delete channels[moduleKey];
        } catch (e) { /* noop */ }
      };
    }).catch(function () { return function () {}; });
  }

  global.PlatformSupabaseBridge = {
    TABLE: TABLE,
    ensureReady: ensureReady,
    isEnabled: isEnabled,
    isPrimary: isPrimary,
    pull: pull,
    push: push,
    subscribe: subscribe
  };
})(typeof window !== 'undefined' ? window : this);
