/**
 * Presentación pantalla TV — seguimiento validador + resumen gráfico
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

  var ETAPA_LABELS = {
    pendiente_carga: 'Pend. por validar',
    en_validacion: 'Validado',
    listo_despacho: 'Cargado'
  };

  var ETAPA_CLS = {
    pendiente_carga: 'pendiente',
    en_validacion: 'validado',
    listo_despacho: 'cargado'
  };

  var KPI_LABELS = {
    pendiente_carga: 'Pendiente por validar',
    en_validacion: 'Validado',
    listo_despacho: 'Cargado'
  };

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

  function listaSignature(share, pedidos, counts, resumen) {
    if (!share || !share.active) return '';
    var rows = (pedidos || []).map(function (p) {
      var store = DS();
      var etapas = store && store.fechasEtapasValidador
        ? store.fechasEtapasValidador(p)
        : {};
      return [p.idc, p.cliente, p.jaula, p.estado, p.validadorAsignado,
        etapas.pendiente_carga, etapas.en_validacion, etapas.listo_despacho].join(':');
    }).join('|');
    var countSig = counts
      ? [counts.pendiente_carga, counts.en_validacion, counts.listo_despacho, counts.total].join(',')
      : '';
    var valSig = '';
    if (resumen && resumen.filas) {
      valSig = resumen.filas.map(function (r) {
        return r.nombre + ':' + r.validado + '/' + r.cargado + '@' + (r.ultimaValidacion || '');
      }).join(';');
    }
    return share.updatedAt + '::' + countSig + '::' + valSig + '::' + rows;
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

  function fmtDtCompact(iso) {
    if (!iso) return '—';
    try {
      var d = new Date(iso);
      var date = new Intl.DateTimeFormat('es-DO', {
        day: 'numeric',
        month: 'numeric',
        timeZone: 'America/Santo_Domingo'
      }).format(d);
      var time = new Intl.DateTimeFormat('es-DO', {
        timeStyle: 'short',
        timeZone: 'America/Santo_Domingo'
      }).format(d);
      return date + ' ' + time;
    } catch (e) {
      return String(iso).slice(0, 16).replace('T', ' ');
    }
  }

  function etapasRowsHtml(p) {
    var store = DS();
    var etapas = store && store.fechasEtapasValidador
      ? store.fechasEtapasValidador(p)
      : {};
    var orden = ['pendiente_carga', 'en_validacion', 'listo_despacho'];
    var paired = '';
    orden.forEach(function (id) {
      var iso = etapas[id];
      var reached = !!iso;
      var current = p.estado === id;
      var cls = ' desp-lista-present-etapa--' + ETAPA_CLS[id] +
        (reached ? ' desp-lista-present-etapa--done' : '') +
        (current ? ' desp-lista-present-etapa--current' : '');
      paired += '<li class="desp-lista-present-etapa-row' + cls + '">' +
        '<span class="desp-lista-present-etapa-lbl">' + esc(ETAPA_LABELS[id]) + '</span>' +
        '<span class="desp-lista-present-etapa-time">' + esc(fmtDtCompact(iso)) + '</span></li>';
    });
    return paired;
  }

  function estadoFechaCellHtml(p) {
    return '<div class="desp-lista-present-estado-fecha-block">' +
      '<div class="desp-lista-present-estado-badge-wrap">' + estadoHtml(p.estado) + '</div>' +
      '<ul class="desp-lista-present-etapas desp-lista-present-etapas--paired" aria-label="Estado y fechas por etapa">' +
      etapasRowsHtml(p) + '</ul></div>';
  }

  function renderTableRows(pedidos) {
    if (!pedidos.length) {
      return '<tr><td colspan="6" class="desp-lista-present-empty">Sin IDC registrados todavía.</td></tr>';
    }
    return pedidos.map(function (p) {
      var store = DS();
      var idc = store ? store.formatIdc(p.idc) : p.idc;
      var cliente = p.cliente ? String(p.cliente).trim() : '—';
      var validador = p.validadorAsignado ? String(p.validadorAsignado).trim() : '—';
      return '<tr>' +
        '<td class="desp-lista-present-idc">' + esc(idc) + '</td>' +
        '<td class="desp-lista-present-cliente">' + esc(cliente) + '</td>' +
        '<td class="desp-lista-present-jaula">' + esc(p.jaula || '—') + '</td>' +
        '<td class="desp-lista-present-validador">' +
        '<span class="desp-lista-present-validador-pill">' + esc(validador) + '</span></td>' +
        '<td class="desp-lista-present-estado-fecha-cell" colspan="2">' + estadoFechaCellHtml(p) + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderKpiCards(data) {
    if (!displayMode) return '';
    var store = DS();
    if (!store) return '';
    var counts = store.countResumenValidador
      ? store.countResumenValidador(data.pedidos || [])
      : { total: 0 };
    return '<div class="desp-lista-present-kpis" role="group" aria-label="Totales por estado">' +
      store.VALIDADOR_ESTADOS.map(function (id) {
        var e = store.ESTADOS[id];
        var icon = store.renderEstadoIconSvg ? store.renderEstadoIconSvg(id, { compact: true }) : '';
        var lbl = KPI_LABELS[id] || e.kpiLabel || e.short || e.label;
        var kpiCls = id === 'pendiente_carga' ? 'pendiente' : (id === 'en_validacion' ? 'validado' : 'cargado');
        return '<div class="desp-lista-present-kpi desp-lista-present-kpi--' + esc(kpiCls) + '">' +
          (icon ? '<span class="desp-lista-present-kpi-iconbox" aria-hidden="true">' + icon + '</span>' : '') +
          '<span class="desp-lista-present-kpi-num">' + esc(String(counts[id] || 0)) + '</span>' +
          '<span class="desp-lista-present-kpi-lbl">' + esc(lbl) + '</span></div>';
      }).join('') +
      '</div>';
  }

  function barScaleGlobal(filas) {
    var m = 0;
    filas.forEach(function (r) {
      var v = Math.max(r.validado || 0, r.cargado || 0);
      if (v > m) m = v;
    });
    return m > 0 ? m : 1;
  }

  function barFlexClass(n) {
    n = Math.max(0, Math.min(250, Math.round(n || 0)));
    return 'desp-bar-n-' + n;
  }

  function renderBarFlex(value, scaleMax, kind) {
    var v = Math.max(0, Math.min(scaleMax, value || 0));
    var rest = Math.max(0, scaleMax - v);
    var html = '<div class="desp-val-chart-bar-line desp-val-chart-bar-line--flex">';
    if (v > 0) {
      html += '<span class="desp-val-chart-bar-fill desp-val-chart-bar-fill--' + kind + ' ' + barFlexClass(v) + '"></span>';
    }
    if (rest > 0) {
      html += '<span class="desp-val-chart-bar-rest ' + barFlexClass(rest) + '"></span>';
    }
    html += '</div>';
    return html;
  }

  function renderResumenGrafico(pedidos) {
    var store = DS();
    if (!store || !store.resumenPorValidador) return '';
    var resumen = store.resumenPorValidador(pedidos || []);
    var filas = resumen.filas || [];
    var scaleMax = barScaleGlobal(filas);

    var rows = filas.map(function (r) {
      return '<div class="desp-val-chart-row">' +
        '<span class="desp-val-chart-name" title="' + esc(r.nombre) + '">' + esc(r.nombre) + '</span>' +
        '<div class="desp-val-chart-bars" role="img" aria-label="' + esc(r.nombre) + ': ' +
        r.validado + ' validados, ' + r.cargado + ' cargados">' +
        '<div class="desp-val-chart-bar-row">' +
        renderBarFlex(r.cargado, scaleMax, 'cargado') +
        '<span class="desp-val-chart-seg-num desp-val-chart-seg-num--cargado">' + esc(String(r.cargado)) + '</span></div>' +
        '<div class="desp-val-chart-bar-row">' +
        renderBarFlex(r.validado, scaleMax, 'validado') +
        '<span class="desp-val-chart-seg-num desp-val-chart-seg-num--validado">' + esc(String(r.validado)) + '</span></div>' +
        '</div>' +
        '<span class="desp-val-chart-ultima">' + esc(fmtDtLista(r.ultimaValidacion)) + '</span>' +
        '</div>';
    }).join('');

    if (!rows) {
      rows = '<p class="desp-val-chart-empty">Sin actividad de validadores.</p>';
    }

    return '<aside class="desp-val-resumen desp-val-resumen--solo-barras" aria-label="Resumen validadores">' +
      '<div class="desp-val-chart-rows">' + rows + '</div></aside>';
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
    var resumen = DS() && DS().resumenPorValidador ? DS().resumenPorValidador(data.pedidos) : null;

    mountEl.hidden = false;
    mountEl.setAttribute('aria-hidden', 'false');
    document.body.classList.add('desp-live-lista-on');

    mountEl.innerHTML =
      '<div class="desp-lista-present-shell">' +
      '<div class="desp-lista-present-inner">' +
      '<div class="desp-lista-present-toolbar">' +
      renderKpiCards(data) +
      renderResumenGrafico(data.pedidos) +
      '</div>' +
      '<div class="desp-lista-present-table-wrap">' +
      '<table class="desp-lista-present-table" aria-label="Lista IDC en seguimiento validador">' +
      '<colgroup><col class="desp-lista-present-col-idc"><col class="desp-lista-present-col-cliente">' +
      '<col class="desp-lista-present-col-jaula"><col class="desp-lista-present-col-validador">' +
      '<col class="desp-lista-present-col-estado"><col class="desp-lista-present-col-fecha"></colgroup>' +
      '<thead><tr><th>IDC</th><th>Cliente</th><th>Jaula</th><th>Validador</th>' +
      '<th class="desp-lista-present-th-estado">Estado</th>' +
      '<th class="desp-lista-present-th-fecha">Fecha y hora</th></tr></thead>' +
      '<tbody>' + renderTableRows(pedidos) + '</tbody></table></div></div></div>';

    lastSig = listaSignature(share, pedidos, counts, resumen);
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
    var resumen = store.resumenPorValidador ? store.resumenPorValidador(data.pedidos) : null;
    var sig = listaSignature(share, pedidos, counts, resumen);
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
