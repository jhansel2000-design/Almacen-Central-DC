/**
 * Control de Turnos — Supabase en vivo
 */
(function (global) {
  'use strict';

  var C = function () { return global.PlatformTurnosCore; };
  var listeners = [];
  var unsub = null;
  var readyPromise = null;
  var setupRequired = false;
  var live = false;

  function sb() {
    return global.PlatformSupabase && global.PlatformSupabase.getClient();
  }

  function isMissing(err) {
    var blob = [err && err.message, err && err.details, err && err.code].filter(Boolean).join(' ');
    return /turnos_queue|turnos_counter|does not exist|42P01|PGRST205/i.test(blob);
  }

  function notify(kind, payload) {
    listeners.forEach(function (fn) {
      try { fn(kind, payload); } catch (e) { /* noop */ }
    });
  }

  function onChange(fn) {
    listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (x) { return x !== fn; });
    };
  }

  function mapRow(row) {
    return C().normalizeEntry({
      id: row.id,
      turno: row.turno,
      fecha: row.fecha,
      hora: row.hora,
      tipo: row.tipo,
      choferNombre: row.chofer_nombre,
      idsCarga: row.ids_carga,
      cantidadViajes: row.cantidad_viajes,
      detalle: row.detalle,
      estado: row.estado,
      convocadoAt: row.convocado_at ? new Date(row.convocado_at).getTime() : null,
      createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
      updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
      updatedBy: row.updated_by
    });
  }

  function toDb(entry) {
    return {
      id: entry.id,
      turno: entry.turno,
      fecha: entry.fecha,
      hora: entry.hora,
      tipo: entry.tipo,
      chofer_nombre: entry.choferNombre,
      ids_carga: entry.idsCarga || '',
      cantidad_viajes: entry.cantidadViajes,
      detalle: entry.detalle,
      estado: entry.estado,
      convocado_at: entry.convocadoAt ? new Date(entry.convocadoAt).toISOString() : null,
      updated_by: entry.updatedBy || ''
    };
  }

  function fetchAll() {
    var client = sb();
    if (!client) return Promise.reject(new Error('Sin Supabase'));
    return Promise.all([
      client.from('turnos_queue').select('*').order('created_at', { ascending: false }).limit(500),
      client.from('turnos_counter').select('counter').eq('id', 1).maybeSingle()
    ]).then(function (res) {
      if (res[0].error) throw res[0].error;
      if (res[1].error && !isMissing(res[1].error)) throw res[1].error;
      setupRequired = false;
      live = true;
      var entries = (res[0].data || []).map(mapRow);
      var counter = (res[1].data && res[1].data.counter) || 0;
      if (!counter && entries.length) {
        counter = entries.reduce(function (max, e) {
          var n = parseInt(String(e.turno || '').replace(/\D/g, ''), 10) || 0;
          return Math.max(max, n);
        }, 0);
      }
      return { entries: entries, counter: counter };
    }).catch(function (err) {
      if (isMissing(err)) setupRequired = true;
      throw err;
    });
  }

  function subscribeRealtime() {
    var RT = global.PlatformSupabaseRealtime;
    if (!sb() || !RT || !RT.subscribeTable) return;
    if (unsub) unsub();
    unsub = RT.subscribeTable({
      id: 'turnos_queue',
      table: 'turnos_queue',
      events: ['INSERT', 'UPDATE', 'DELETE'],
      onEvent: function () {
        fetchAll().then(function (data) {
          notify('sync', data);
        }).catch(function () { /* noop */ });
      },
      pull: fetchAll,
      pollFallbackMs: 5000,
      onData: function (data) {
        notify('sync', data);
      }
    });
  }

  function ready() {
    if (readyPromise) return readyPromise;
    readyPromise = new Promise(function (resolve) {
      if (!sb()) {
        setupRequired = true;
        resolve({ ok: false, local: true });
        return;
      }
      fetchAll().then(function (data) {
        subscribeRealtime();
        resolve({ ok: true, data: data });
      }).catch(function () {
        resolve({ ok: false, local: true });
      });
    });
    return readyPromise;
  }

  function nextCounter() {
    var client = sb();
    if (!client) return Promise.reject(new Error('Sin Supabase'));
    return client.rpc('turnos_next_counter').then(function (res) {
      if (res.error) throw res.error;
      return Number(res.data) || 0;
    });
  }

  function insertTurn(payload) {
    var client = sb();
    if (!client) return Promise.reject(new Error('Sin Supabase'));
    return nextCounter().then(function (n) {
      var draft = C().createTurn(n, payload);
      var row = toDb(draft);
      delete row.id;
      row.created_at = new Date(draft.createdAt).toISOString();
      row.updated_at = row.created_at;
      return client.from('turnos_queue').insert(row).select('*').single().then(function (res) {
        if (res.error) throw res.error;
        return mapRow(res.data);
      });
    });
  }

  function patchTurn(id, patch) {
    var client = sb();
    if (!client) return Promise.reject(new Error('Sin Supabase'));
    patch.updated_at = new Date().toISOString();
    return client.from('turnos_queue').update(patch).eq('id', id).select('*').single().then(function (res) {
      if (res.error) throw res.error;
      return mapRow(res.data);
    });
  }

  function updateEstado(id, estado, adminUser) {
    return patchTurn(id, {
      estado: estado,
      updated_by: adminUser || 'admin'
    });
  }

  function convocarChofer(id, adminUser) {
    var entry = null;
    return fetchAll().then(function (data) {
      entry = data.entries.find(function (e) { return e.id === id; });
      if (!entry) throw new Error('Turno no encontrado');
      var patch = {
        convocado_at: new Date().toISOString(),
        updated_by: adminUser || 'admin'
      };
      if (C().allowedStates(entry.tipo).indexOf('EN_PROCESO') >= 0) {
        patch.estado = 'EN_PROCESO';
      }
      return patchTurn(id, patch);
    });
  }

  function isLive() { return live; }
  function isSetupRequired() { return setupRequired; }

  function teardown() {
    if (unsub) unsub();
    unsub = null;
  }

  global.PlatformTurnosSync = {
    ready: ready,
    fetchAll: fetchAll,
    insertTurn: insertTurn,
    updateEstado: updateEstado,
    convocarChofer: convocarChofer,
    onChange: onChange,
    isLive: isLive,
    isSetupRequired: isSetupRequired,
    teardown: teardown
  };
})(typeof window !== 'undefined' ? window : this);
