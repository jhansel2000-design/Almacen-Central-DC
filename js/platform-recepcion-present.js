/**
 * Presentación TV — Control Patio · Recepción de contenedores
 */
(function (global) {
  'use strict';

  var esc = global.PanelCore ? global.PanelCore.esc : function (s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  var bound = false;
  var mountEl = null;
  var lastSig = '';

  function S() { return global.PlatformRecepcionStore; }

  function badge(val) {
    if (val === 'ok') return '<span class="rec-present-badge rec-present-badge--ok">OK</span>';
    return '<span class="rec-present-badge rec-present-badge--pend">PENDIENTE</span>';
  }

  function tipoBadge(tipo) {
    var cls = tipo === 'local' ? 'local' : 'importado';
    return '<span class="rec-present-tipo rec-present-tipo--' + cls + '">' +
      (tipo === 'local' ? 'LOCAL' : 'IMPORTADO') + '</span>';
  }

  function signature(share, contenedores, counts) {
    if (!share || !share.active) return '';
    var rows = (contenedores || []).map(function (c) {
      return [c.contenedor, c.tipo, c.division, c.validado, c.entrada, c.paletas, c.muelle].join(':');
    }).join('|');
    var c = counts || {};
    return share.updatedAt + '::' + [c.total, c.pendienteValidar, c.conEntrada].join(',') + '::' + rows;
  }

  function renderRows(contenedores) {
    var store = S();
    if (!contenedores.length) {
      return '<tr><td colspan="8" class="rec-present-empty">Sin contenedores en seguimiento.</td></tr>';
    }
    return contenedores.map(function (c) {
      return '<tr>' +
        '<td class="rec-present-fecha">' + esc(store.formatFechaSolo(c.fecha)) + '</td>' +
        '<td class="rec-present-contenedor">' + esc(c.contenedor) + '</td>' +
        '<td class="rec-present-tipo-cell">' + tipoBadge(c.tipo) + '</td>' +
        '<td class="rec-present-division">' + esc(c.division || '—') + '</td>' +
        '<td class="rec-present-desc">' + esc(c.descripcion || '—') + '</td>' +
        '<td class="rec-present-num">' + esc(String(c.paletas || 0)) + '</td>' +
        '<td class="rec-present-muelle">' + esc(c.muelle || '—') + '</td>' +
        '<td class="rec-present-status">' + badge(c.validado) + '</td>' +
        '<td class="rec-present-status">' + badge(c.entrada) + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderMount(share, data) {
    if (!mountEl) return;
    var store = S();
    if (!store) return;

    if (!share || !share.active) {
      mountEl.hidden = true;
      mountEl.setAttribute('aria-hidden', 'true');
      mountEl.innerHTML = '';
      document.body.classList.remove('rec-live-on');
      lastSig = '';
      return;
    }

    data = data || store.load();
    var contenedores = store.getContenedoresActivos(data.contenedores);
    var counts = store.countResumen(data.contenedores);

    mountEl.hidden = false;
    mountEl.setAttribute('aria-hidden', 'false');
    document.body.classList.add('rec-live-on');

    mountEl.innerHTML =
      '<div class="rec-present-shell">' +
      '<header class="rec-present-header">' +
      '<img class="jc-logo-img jc-logo-img--present" src="assets/img/jc-logo.png?v=5" alt="AC" width="44" height="44">' +
      '<div><p class="rec-present-eyebrow">Almacén Central DC</p>' +
      '<h1 class="rec-present-title">Gestión de Recepción y Ubicación</h1></div>' +
      '<div class="rec-present-kpis">' +
      '<span><strong>' + esc(String(counts.total || 0)) + '</strong> seguimiento</span>' +
      '<span><strong>' + esc(String(counts.pendienteValidar || 0)) + '</strong> pend. validar</span>' +
      '<span><strong>' + esc(String(counts.conEntrada || 0)) + '</strong> con entrada</span>' +
      '</div></header>' +
      '<div class="rec-present-table-wrap">' +
      '<table class="rec-present-table" aria-label="Seguimiento contenedores en vivo">' +
      '<thead><tr>' +
      '<th>Fecha</th><th>Contenedor</th><th>Tipo</th><th>División</th><th>Descripción</th>' +
      '<th>Paletas</th><th>Muelle</th><th>Validado</th><th>Entrada</th>' +
      '</tr></thead>' +
      '<tbody>' + renderRows(contenedores) + '</tbody></table></div></div>';

    lastSig = signature(share, contenedores, counts);
  }

  function refreshFromStore() {
    var store = S();
    if (!store) return;
    var data = store.load();
    var share = store.getLiveShareBoard(data);
    if (!share || !share.active) {
      renderMount(null);
      return;
    }
    var contenedores = store.getContenedoresActivos(data.contenedores);
    var counts = store.countResumen(data.contenedores);
    var sig = signature(share, contenedores, counts);
    if (sig === lastSig) return;
    renderMount(share, data);
  }

  function ensureMount() {
    if (mountEl && mountEl.isConnected) return mountEl;
    mountEl = document.getElementById('recGlobalLiveBoard');
    if (!mountEl) {
      mountEl = document.createElement('div');
      mountEl.id = 'recGlobalLiveBoard';
      mountEl.className = 'rec-live-present';
      mountEl.hidden = true;
      mountEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(mountEl);
    }
    return mountEl;
  }

  function bind(opts) {
    if (bound) return;
    bound = true;
    opts = opts || {};
    ensureMount();

    function onUpdate() { refreshFromStore(); }

    global.addEventListener('recepcion-updated', onUpdate);
    global.addEventListener('recepcion-live-board', onUpdate);
    global.addEventListener('storage', function (ev) {
      if (ev.key === (S() && S().STORAGE_KEY)) onUpdate();
    });
    if (typeof global.BroadcastChannel !== 'undefined') {
      var bc = new global.BroadcastChannel('recepcion-live-board');
      bc.onmessage = function () { onUpdate(); };
    }

    if (opts.displayMode) refreshFromStore();
  }

  global.PlatformRecepcionPresent = {
    bind: bind,
    refresh: refreshFromStore,
    render: renderMount
  };
})(typeof window !== 'undefined' ? window : this);
