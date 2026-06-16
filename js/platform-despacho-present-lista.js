/**
 * Presentación en vivo — lista IDC + jaula + estado para validadores
 */
(function (global) {
  'use strict';

  var esc = global.PanelCore ? global.PanelCore.esc : function (s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  var bound = false;
  var mountEl = null;
  var lastSig = '';
  var displayMode = false;

  function DS() {
    return global.PlatformDespachoStore;
  }

  function resolveDisplayMode(opts) {
    if (opts && opts.displayMode != null) return !!opts.displayMode;
    if (global.PlatformDespachoDisplay && global.PlatformDespachoDisplay.isDisplayMode) {
      return global.PlatformDespachoDisplay.isDisplayMode();
    }
    return !!(global.document && global.document.body &&
      global.document.body.classList.contains('desp-display-mode'));
  }

  function shouldShowOnThisPage() {
    return displayMode;
  }

  function estadoHtml(estadoId) {
    var store = DS();
    if (!store) return esc(estadoId || '—');
    var e = store.ESTADOS[estadoId] || { label: estadoId, short: estadoId, color: 'neutral' };
    var icon = store.renderEstadoIconSvg ? store.renderEstadoIconSvg(estadoId) : '';
    return '<span class="desp-lista-present-estado desp-lista-present-estado--' + esc(e.color) + '">' +
      icon + '<span>' + esc(e.short || e.label) + '</span></span>';
  }

  function listaSignature(share, pedidos, counts) {
    if (!share || !share.active) return '';
    var rows = (pedidos || []).map(function (p) {
      return [p.idc, p.cliente, p.jaula, p.estado, p.validadorAsignado, p.createdAt, p.updatedAt].join(':');
    }).join('|');
    var countSig = counts
      ? [counts.pendiente_carga, counts.en_validacion, counts.listo_despacho, counts.total].join(',')
      : '';
    return share.updatedAt + '::' + countSig + '::' + rows;
  }

  function fmtDtLista(iso) {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('es-DO', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'America/Santo_Domingo'
      }).format(new Date(iso));
    } catch (e) {
      return String(iso).slice(0, 16).replace('T', ' ');
    }
  }

  function renderTableRows(pedidos) {
    if (!pedidos.length) {
      return '<tr><td colspan="6" class="desp-lista-present-empty">Sin IDC registrados todavía.</td></tr>';
    }
    return pedidos.map(function (p) {
      var store = DS();
      var idc = store ? store.formatIdc(p.idc) : p.idc;
      var cliente = p.cliente ? String(p.cliente).trim() : '—';
      return '<tr>' +
        '<td class="desp-lista-present-idc">' + esc(idc) + '</td>' +
        '<td class="desp-lista-present-cliente">' + esc(cliente) + '</td>' +
        '<td class="desp-lista-present-jaula">' + esc(p.jaula || '—') + '</td>' +
        '<td class="desp-lista-present-validador">' + esc(p.validadorAsignado || '—') + '</td>' +
        '<td class="desp-lista-present-fecha">' + esc(fmtDtLista(p.createdAt || p.updatedAt)) + '</td>' +
        '<td class="desp-lista-present-estado-cell">' + estadoHtml(p.estado) + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderTotalesBar(data) {
    if (!displayMode) return '';
    var store = DS();
    if (!store) return '';
    var counts = store.countResumenValidador
      ? store.countResumenValidador(data.pedidos || [])
      : { total: 0 };
    return '<div class="desp-lista-present-totales" role="group" aria-label="Totales por estado">' +
      store.VALIDADOR_ESTADOS.map(function (id) {
        var e = store.ESTADOS[id];
        var icon = store.renderEstadoIconSvg ? store.renderEstadoIconSvg(id, { compact: true }) : '';
        var lbl = e.kpiLabel || e.short || e.label;
        return '<div class="desp-lista-present-total desp-lista-present-total--' + esc(e.color) + '">' +
          (icon ? '<span class="desp-lista-present-total-icon" aria-hidden="true">' + icon + '</span>' : '') +
          '<span class="desp-lista-present-total-body">' +
          '<span class="desp-lista-present-total-num">' + esc(String(counts[id] || 0)) + '</span>' +
          '<span class="desp-lista-present-total-lbl">' + esc(lbl) + '</span></span></div>';
      }).join('') +
      '</div>';
  }

  function renderMount(share, data) {
    if (!mountEl) return;
    if (!shouldShowOnThisPage() || !share || !share.active) {
      mountEl.hidden = true;
      mountEl.setAttribute('aria-hidden', 'true');
      mountEl.innerHTML = '';
      if (global.document && global.document.body) {
        global.document.body.classList.remove('desp-live-lista-on');
      }
      lastSig = '';
      return;
    }

    data = data || (DS() ? DS().load() : { pedidos: [] });
    var pedidos = DS() ? DS().getPedidosVisiblesValidador(data.pedidos) : [];
    var counts = DS() && DS().countResumenValidador ? DS().countResumenValidador(data.pedidos) : null;

    mountEl.hidden = false;
    mountEl.setAttribute('aria-hidden', 'false');
    document.body.classList.add('desp-live-lista-on');

    mountEl.innerHTML =
      '<div class="desp-lista-present-shell">' +
      '<div class="desp-lista-present-inner">' +
      '<div class="desp-lista-present-head">' +
      '<div class="desp-lista-present-badge"><span class="desp-lista-present-dot"></span> EN VIVO · Seguimiento validador</div>' +
      '<p class="desp-lista-present-meta">' + esc(String(pedidos.length)) + ' IDC en validación · Validador: ' +
      esc(share.sharedBy || '—') + '</p></div>' +
      renderTotalesBar(data) +
      '<div class="desp-lista-present-table-wrap">' +
      '<table class="desp-lista-present-table" aria-label="Lista IDC y jaulas en vivo">' +
      '<thead><tr><th>IDC</th><th>Cliente</th><th>Jaula</th><th>Validador</th><th>Fecha y hora</th><th>Estado</th></tr></thead>' +
      '<tbody>' + renderTableRows(pedidos) + '</tbody></table></div></div></div>';

    lastSig = listaSignature(share, pedidos, counts);
  }

  function refreshFromStore() {
    var store = DS();
    if (!store) return;
    if (!shouldShowOnThisPage()) {
      renderMount(null);
      return;
    }
    var data = store.load();
    var share = store.getLiveShareLista ? store.getLiveShareLista(data) : null;
    if (!share || !share.active) {
      renderMount(null);
      return;
    }
    var pedidos = store.getPedidosVisiblesValidador(data.pedidos);
    var counts = store.countResumenValidador ? store.countResumenValidador(data.pedidos) : null;
    var sig = listaSignature(share, pedidos, counts);
    if (sig === lastSig) return;
    renderMount(share, data);
  }

  function ensureMount() {
    if (mountEl && mountEl.isConnected) return mountEl;
    mountEl = document.getElementById('despGlobalLiveLista');
    if (!mountEl) {
      mountEl = document.createElement('div');
      mountEl.id = 'despGlobalLiveLista';
      mountEl.className = 'desp-live-present-lista';
      mountEl.hidden = true;
      mountEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(mountEl);
    }
    return mountEl;
  }

  function bind(opts) {
    if (bound) return;
    bound = true;
    displayMode = resolveDisplayMode(opts || {});
    ensureMount();

    function onUpdate() {
      refreshFromStore();
    }

    global.addEventListener('despacho-updated', onUpdate);
    global.addEventListener('despacho-live-lista', onUpdate);
    global.addEventListener('storage', function (ev) {
      if (ev.key === (DS() && DS().STORAGE_KEY)) onUpdate();
    });

    if (typeof global.BroadcastChannel !== 'undefined') {
      var bc = new global.BroadcastChannel('despacho-live-lista');
      bc.onmessage = function () { onUpdate(); };
    }

    refreshFromStore();
  }

  function unbind() {
    bound = false;
    if (mountEl) renderMount(null);
  }

  global.PlatformDespachoPresentLista = {
    bind: bind,
    unbind: unbind,
    refresh: refreshFromStore,
    render: renderMount,
    renderTableRows: renderTableRows
  };
})(typeof window !== 'undefined' ? window : this);
