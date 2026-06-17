/**
 * Tablón informativo — Supabase + caché local
 */
(function (global) {
  'use strict';

  var CORE = null;
  var items = [];
  var listeners = [];
  var unsub = null;
  var readyPromise = null;
  var setupRequired = false;

  function core() {
    return CORE || (CORE = global.PlatformHubNewsCore);
  }

  function sb() {
    return global.PlatformSupabase && global.PlatformSupabase.getClient();
  }

  function isMissingTableError(err) {
    if (!err) return false;
    var blob = [err.message, err.details, err.hint, err.code, err.error, err.statusText]
      .filter(Boolean).join(' ');
    return /hub_news|does not exist|42P01|PGRST205|PGRST204|Could not find the table/i.test(blob);
  }

  function notify(kind, payload) {
    listeners.forEach(function (fn) {
      try { fn(kind, payload); } catch (e) { /* noop */ }
    });
  }

  function onChange(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (x) { return x !== fn; });
    };
  }

  function mergeRows(rows) {
    var C = core();
    items = C.activeItems(C.refreshSeedCopy((rows || []).map(C.mapRow).filter(Boolean)));
    C.writeLocal(items);
    notify('items', items);
    return items;
  }

  function getItems() {
    return items.slice();
  }

  function isSetupRequired() {
    return setupRequired;
  }

  function fetchAll() {
    var client = sb();
    if (!client) {
      mergeRows(core().readLocal());
      return Promise.resolve(items);
    }
    return client.from('hub_news')
      .select('id, title, body, published_at, published_by, active, pinned, image_url, link_url, theme')
      .eq('active', true)
      .order('pinned', { ascending: false })
      .order('published_at', { ascending: false })
      .limit(30)
      .then(function (res) {
        if (res.error) throw res.error;
        setupRequired = false;
        mergeRows(res.data);
        if (!items.length) mergeRows(core().readLocal());
        return items;
      })
      .catch(function (err) {
        if (isMissingTableError(err)) setupRequired = true;
        mergeRows(core().readLocal());
        return items;
      });
  }

  function subscribe() {
    if (unsub) return;
    var RT = global.PlatformSupabaseRealtime;
    if (!RT || !RT.subscribeTable || !sb()) return;
    unsub = RT.subscribeTable({
      id: 'hub_news',
      table: 'hub_news',
      events: ['INSERT', 'UPDATE', 'DELETE'],
      onEvent: function () { fetchAll(); },
      pull: fetchAll,
      pollFallbackMs: 8000
    });
  }

  function init() {
    if (readyPromise) return readyPromise;
    readyPromise = (global.PlatformSupabase && global.PlatformSupabase.init
      ? global.PlatformSupabase.init()
      : Promise.resolve()
    ).then(function () {
      return fetchAll().then(function () {
        subscribe();
        return items;
      });
    });
    return readyPromise;
  }

  function saveItem(data, actorName) {
    var C = core();
    var check = C.validateItem(data);
    if (!check.ok) return Promise.resolve(check);
    var client = sb();
    var now = new Date().toISOString();
    var row = C.toDbRow({
      id: data.id || '',
      title: check.item.title,
      body: check.item.body,
      publishedAt: data.id ? undefined : now,
      publishedBy: actorName || '',
      active: true,
      pinned: check.item.pinned,
      imageUrl: check.item.imageUrl,
      linkUrl: check.item.linkUrl,
      theme: check.item.theme
    });

    if (client && !setupRequired) {
      if (data.id) {
        return client.from('hub_news')
          .update({
            title: row.title,
            body: row.body,
            pinned: row.pinned,
            image_url: row.image_url,
            link_url: row.link_url,
            theme: row.theme
          })
          .eq('id', data.id)
          .select('id, title, body, published_at, published_by, active, pinned, image_url, link_url, theme')
          .single()
          .then(function (res) {
            if (res.error) throw res.error;
            return fetchAll().then(function () {
              return { ok: true, item: C.mapRow(res.data) };
            });
          })
          .catch(function (err) {
            return saveLocalFallback(data, check.item, actorName, err);
          });
      }
      return client.from('hub_news')
        .insert({
          title: row.title,
          body: row.body,
          published_at: now,
          published_by: actorName || '',
          active: true,
          pinned: row.pinned,
          image_url: row.image_url,
          link_url: row.link_url,
          theme: row.theme
        })
        .select('id, title, body, published_at, published_by, active, pinned, image_url, link_url, theme')
        .single()
        .then(function (res) {
          if (res.error) throw res.error;
          return fetchAll().then(function () {
            return { ok: true, item: C.mapRow(res.data) };
          });
        })
        .catch(function (err) {
          return saveLocalFallback(data, check.item, actorName, err);
        });
    }
    return saveLocalFallback(data, check.item, actorName);
  }

  function saveLocalFallback(data, validated, actorName, err) {
    var C = core();
    var list = C.readLocal();
    var now = new Date().toISOString();
    if (data.id) {
      list = list.map(function (n) {
        if (n.id !== data.id) return n;
        return Object.assign({}, n, validated);
      });
    } else {
      list.unshift({
        id: 'local_' + Date.now(),
        title: validated.title,
        body: validated.body,
        publishedAt: now,
        publishedBy: actorName || '',
        active: true,
        pinned: validated.pinned,
        imageUrl: validated.imageUrl || '',
        linkUrl: validated.linkUrl || '',
        theme: validated.theme || ''
      });
    }
    mergeRows(list);
    var msg = err && isMissingTableError(err)
      ? 'Guardado en este navegador. Ejecute SETUP-HUB-NEWS-SUPABASE.bat para sync en la nube.'
      : (err ? ((err.message || 'Error') + ' — guardado localmente.') : '');
    return Promise.resolve({ ok: true, item: list[0], localOnly: true, message: msg });
  }

  function removeItem(id) {
    if (!id) return Promise.resolve({ ok: false, message: 'Noticia no encontrada.' });
    var client = sb();
    if (client && !setupRequired) {
      return client.from('hub_news')
        .update({ active: false })
        .eq('id', id)
        .then(function (res) {
          if (res.error) throw res.error;
          return fetchAll().then(function () { return { ok: true }; });
        })
        .catch(function () { return removeLocal(id); });
    }
    return removeLocal(id);
  }

  function removeLocal(id) {
    var C = core();
    var list = C.readLocal().filter(function (n) { return n.id !== id; });
    mergeRows(list);
    return Promise.resolve({ ok: true, localOnly: true });
  }

  global.PlatformHubNewsSync = {
    init: init,
    fetchAll: fetchAll,
    getItems: getItems,
    onChange: onChange,
    saveItem: saveItem,
    removeItem: removeItem,
    isSetupRequired: isSetupRequired
  };
})(typeof window !== 'undefined' ? window : this);
