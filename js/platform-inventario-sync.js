/**
 * Inventario RF — sincronización Supabase + caché local
 */
(function (global) {
  'use strict';

  var CACHE_USERS = 'inv_dc_users_cache';
  var CACHE_ENTRIES = 'inv_dc_entries_cache';
  var CORE = null;
  var realtimeChannel = null;
  var listeners = [];

  function core() {
    return CORE || (CORE = global.PlatformInventarioCore);
  }

  function sb() {
    return global.PlatformSupabase && global.PlatformSupabase.getClient();
  }

  function readCache(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : (fallback || null);
    } catch (e) {
      return fallback || null;
    }
  }

  function writeCache(key, data) {
    try {
      global.localStorage.setItem(key, JSON.stringify(data));
    } catch (e) { /* noop */ }
  }

  function notify(kind, payload) {
    listeners.forEach(function (fn) {
      try { fn(kind, payload); } catch (e) { /* noop */ }
    });
  }

  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (x) { return x !== fn; });
    };
  }

  function mapUser(row) {
    if (!row) return null;
    return {
      employeeId: row.employee_id,
      displayName: row.display_name,
      role: row.role,
      active: row.active !== false,
      adminPin: row.admin_pin || ''
    };
  }

  function mapEntry(row) {
    if (!row) return null;
    return {
      id: row.id,
      barcode: row.barcode,
      productName: row.product_name,
      quantity: row.quantity,
      zone: row.zone,
      warehouse: row.warehouse,
      unit: row.unit,
      expectedQty: row.expected_qty,
      matricula: row.matricula,
      expirationDate: row.expiration_date,
      userId: row.user_id,
      createdAt: row.created_at,
      synced: row.synced,
      countMode: row.count_mode,
      rackPassIndex: row.rack_pass_index,
      rackPassesTotal: row.rack_passes_total,
      countNumber: row.count_number
    };
  }

  function fetchUsers() {
    var client = sb();
    if (!client) {
      return Promise.resolve(readCache(CACHE_USERS, []));
    }
    return client.from('inv_users')
      .select('employee_id, display_name, role, active, admin_pin')
      .eq('active', true)
      .then(function (res) {
        if (res.error) throw res.error;
        var list = (res.data || []).map(mapUser);
        writeCache(CACHE_USERS, list);
        return list;
      })
      .catch(function () {
        return readCache(CACHE_USERS, []);
      });
  }

  function verifyLogin(role, code, pin) {
    return fetchUsers().then(function (users) {
      if (role === 'admin') {
        var admin = users.find(function (u) {
          return u.role === 'ADMIN' && String(u.employeeId).toLowerCase() === String(code || '').trim().toLowerCase();
        });
        if (!admin) return null;
        if (String(admin.adminPin || '') !== String(pin || '')) return null;
        return admin;
      }
      var id = String(code || '').trim();
      var counter = users.find(function (u) {
        return u.role === 'COUNT' && u.employeeId === id && u.active;
      });
      return counter || null;
    });
  }

  function lookupCatalog(barcode, location) {
    var client = sb();
    if (!client || !barcode) return Promise.resolve(null);
    var q = client.from('inv_catalog')
      .select('*')
      .eq('article_code', String(barcode).trim())
      .limit(5);
    if (location) q = q.eq('location', String(location).trim());
    return q.then(function (res) {
      if (res.error || !res.data || !res.data.length) return null;
      var row = res.data[0];
      return {
        name: row.product_name,
        matricula: row.matricula || '',
        expectedQty: parseFloat(row.qty_available) || 0,
        unit: row.unit || 'CJ'
      };
    }).catch(function () { return null; });
  }

  function lookupPairCode(code) {
    var client = sb();
    if (!client || !code) return Promise.resolve(null);
    return client.from('inv_article_pairs')
      .select('*')
      .or('codigo_v1.eq.' + code + ',codigo_v2.eq.' + code)
      .limit(1)
      .then(function (res) {
        if (res.error || !res.data || !res.data.length) return null;
        var row = res.data[0];
        return {
          articleCode: row.articulo || row.codigo_v1,
          productName: row.product_name,
          scannedCode: code
        };
      }).catch(function () { return null; });
  }

  function fetchEntries(limit) {
    limit = limit || 500;
    var client = sb();
    if (!client) {
      return Promise.resolve(readCache(CACHE_ENTRIES, []));
    }
    return client.from('inv_entries')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
      .then(function (res) {
        if (res.error) throw res.error;
        var list = (res.data || []).map(mapEntry);
        writeCache(CACHE_ENTRIES, list);
        return list;
      })
      .catch(function () {
        return readCache(CACHE_ENTRIES, []);
      });
  }

  function countRoundForLocation(location, barcode) {
    return fetchEntries(1000).then(function (entries) {
      var same = entries.filter(function (e) {
        return e.zone === location && e.barcode === barcode;
      });
      return same.length + 1;
    });
  }

  function insertEntry(fields) {
    var C = core();
    var payload = C.buildEntryPayload(fields);
    var client = sb();
    if (!client) {
      var local = readCache(CACHE_ENTRIES, []);
      var entry = Object.assign({ id: 'local-' + Date.now(), createdAt: new Date().toISOString() }, fields);
      local.unshift(entry);
      writeCache(CACHE_ENTRIES, local.slice(0, 500));
      notify('entry', entry);
      return Promise.resolve({ ok: true, entry: entry, offline: true });
    }
    return client.from('inv_entries').insert(payload).select().single()
      .then(function (res) {
        if (res.error) throw res.error;
        var entry = mapEntry(res.data);
        notify('entry', entry);
        return { ok: true, entry: entry, offline: false };
      });
  }

  function deleteAllEntries() {
    var client = sb();
    if (!client) {
      writeCache(CACHE_ENTRIES, []);
      notify('clear', []);
      return Promise.resolve(true);
    }
    return client.from('inv_entries').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      .then(function (res) {
        if (res.error) throw res.error;
        writeCache(CACHE_ENTRIES, []);
        notify('clear', []);
        return true;
      });
  }

  function bindRealtime() {
    var client = sb();
    if (!client || realtimeChannel) return;
    realtimeChannel = client.channel('inv_entries_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inv_entries' }, function () {
        fetchEntries().then(function (list) {
          notify('sync', list);
        });
      })
      .subscribe();
  }

  function init() {
    return (global.PlatformSupabase ? global.PlatformSupabase.init() : Promise.resolve(false))
      .then(function () {
        bindRealtime();
        return fetchUsers();
      });
  }

  global.PlatformInventarioSync = {
    init: init,
    onChange: onChange,
    fetchUsers: fetchUsers,
    verifyLogin: verifyLogin,
    lookupCatalog: lookupCatalog,
    lookupPairCode: lookupPairCode,
    fetchEntries: fetchEntries,
    countRoundForLocation: countRoundForLocation,
    insertEntry: insertEntry,
    deleteAllEntries: deleteAllEntries,
    isOnline: function () {
      return global.PlatformSupabase && global.PlatformSupabase.isConnected();
    }
  };
})(typeof window !== 'undefined' ? window : this);
