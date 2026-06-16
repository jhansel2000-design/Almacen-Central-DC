/**
 * Puente Supabase — sync central de TODA la web (WMS, averías, despacho, inventario)
 */
(function (global) {
  'use strict';

  var TABLE = 'web_snapshots';
  var channels = {};
  var pollTimers = {};
  var lastPullAt = {};

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

  function restConfig() {
    var cfg = global.PlatformSupabase && global.PlatformSupabase.getConfig && global.PlatformSupabase.getConfig();
    var sb = cfg && cfg.supabase;
    if (!sb || !sb.enabled || !sb.url || !sb.anonKey) return null;
    return { url: String(sb.url).replace(/\/+$/, ''), key: sb.anonKey };
  }

  function sanitize(data) {
    try { return JSON.parse(JSON.stringify(data || {})); } catch (e) { return data || {}; }
  }

  function markConnected(ok) {
    if (global.PlatformSupabase && global.PlatformSupabase.markConnected) {
      global.PlatformSupabase.markConnected(!!ok);
    }
  }

  function ensureReady() {
    if (!global.PlatformSupabase) return Promise.resolve(null);
    return global.PlatformSupabase.init().then(function () {
      return isEnabled() ? sb() : null;
    });
  }

  function pullViaRest(moduleKey) {
    var rc = restConfig();
    if (!rc || !moduleKey) return Promise.resolve(null);
    return global.fetch(
      rc.url + '/rest/v1/' + TABLE + '?module=eq.' + encodeURIComponent(moduleKey) + '&select=data',
      {
        headers: {
          apikey: rc.key,
          Authorization: 'Bearer ' + rc.key
        },
        cache: 'no-store',
        mode: 'cors'
      }
    ).then(function (res) {
      if (!res.ok) return null;
      return res.json().then(function (rows) {
        var data = rows && rows[0] && rows[0].data ? rows[0].data : null;
        if (data) {
          markConnected(true);
          lastPullAt[moduleKey] = Date.now();
        }
        return data;
      });
    }).catch(function () { return null; });
  }

  function pushViaRest(moduleKey, data) {
    var rc = restConfig();
    if (!rc || !moduleKey || !data) return Promise.resolve(false);
    var row = {
      module: moduleKey,
      data: sanitize(data),
      updated_at: new Date().toISOString()
    };
    return global.fetch(rc.url + '/rest/v1/' + TABLE, {
      method: 'POST',
      headers: {
        apikey: rc.key,
        Authorization: 'Bearer ' + rc.key,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify(row),
      mode: 'cors'
    }).then(function (res) {
      var ok = res.ok;
      if (ok) markConnected(true);
      return ok;
    }).catch(function () { return false; });
  }

  function pull(moduleKey) {
    if (!moduleKey) return Promise.resolve(null);
    return ensureReady().then(function (client) {
      if (!client) return pullViaRest(moduleKey);
      return client.from(TABLE)
        .select('data, updated_at')
        .eq('module', moduleKey)
        .maybeSingle()
        .then(function (res) {
          if (res.error || !res.data) return pullViaRest(moduleKey);
          markConnected(true);
          lastPullAt[moduleKey] = Date.now();
          return res.data.data || null;
        })
        .catch(function () { return pullViaRest(moduleKey); });
    }).catch(function () { return pullViaRest(moduleKey); });
  }

  function push(moduleKey, data) {
    if (!moduleKey || !data) return Promise.resolve(false);
    return ensureReady().then(function (client) {
      if (!client) return pushViaRest(moduleKey, data);
      var row = {
        module: moduleKey,
        data: sanitize(data),
        updated_at: new Date().toISOString()
      };
      return client.from(TABLE)
        .upsert(row, { onConflict: 'module' })
        .then(function (res) {
          if (res.error) return pushViaRest(moduleKey, data);
          markConnected(true);
          return true;
        })
        .catch(function () { return pushViaRest(moduleKey, data); });
    }).catch(function () { return pushViaRest(moduleKey, data); });
  }

  function startPollFallback(moduleKey, callback) {
    if (pollTimers[moduleKey]) global.clearInterval(pollTimers[moduleKey]);
    pull(moduleKey).then(function (data) {
      if (data && typeof callback === 'function') callback(data);
    });
    pollTimers[moduleKey] = global.setInterval(function () {
      if (global.document && global.document.visibilityState === 'hidden') return;
      pull(moduleKey).then(function (data) {
        if (data && typeof callback === 'function') callback(data);
      });
    }, 250);
  }

  function subscribe(moduleKey, callback) {
    if (!moduleKey || typeof callback !== 'function') return function () {};
    startPollFallback(moduleKey, callback);
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
    subscribe: subscribe,
    getLastPullAt: function (moduleKey) { return lastPullAt[moduleKey] || 0; }
  };
})(typeof window !== 'undefined' ? window : this);
