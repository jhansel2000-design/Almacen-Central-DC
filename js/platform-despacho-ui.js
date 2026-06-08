/**
 * UI — Módulo Despacho (Preparador + Validador)
 */
(function (global) {
  'use strict';

  var esc = global.PanelCore ? global.PanelCore.esc : function (s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  var DS = null;
  var unbindSync = null;
  var lastOpts = null;

  function fmtDt(iso) {
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

  function estadoBadge(estadoId) {
    var e = DS.ESTADOS[estadoId] || { label: estadoId, icon: '●', color: 'neutral' };
    return '<span class="desp-estado desp-estado--' + esc(e.color) + '">' +
      '<span class="desp-estado-icon" aria-hidden="true">' + esc(e.icon) + '</span>' +
      '<span class="desp-estado-text">' + esc(e.short || e.label) + '</span></span>';
  }

  function flujoHtml() {
    return '<div class="desp-flujo" aria-label="Flujo de despacho">' +
      DS.FLUJO.map(function (id, i) {
        var e = DS.ESTADOS[id];
        return (i > 0 ? '<span class="desp-flujo-arrow" aria-hidden="true">→</span>' : '') +
          '<span class="desp-flujo-step desp-flujo-step--' + esc(e.color) + '">' +
          esc(e.icon) + ' ' + esc(e.short) + '</span>';
      }).join('') +
      '</div>';
  }

  function kpiStrip(counts) {
    counts = counts || {};
    return '<div class="desp-kpi-strip">' +
      Object.keys(DS.ESTADOS).map(function (id) {
        var e = DS.ESTADOS[id];
        return '<article class="desp-kpi desp-kpi--' + esc(e.color) + '">' +
          '<span class="desp-kpi-val">' + esc(String(counts[id] || 0)) + '</span>' +
          '<span class="desp-kpi-lbl">' + esc(e.short) + '</span></article>';
      }).join('') +
      '</div>';
  }

  function renderPreparador(data, opts) {
    var counts = DS.countByEstado(data.pedidos);
    return '<section class="desp-panel desp-panel--prep" aria-labelledby="despPrepTitle">' +
      '<header class="desp-panel-head">' +
      '<div><span class="desp-eyebrow">Panel 1</span>' +
      '<h3 id="despPrepTitle">Preparador de pedidos</h3>' +
      '<p class="desp-panel-sub">Registre IDC y jaula · estados: en proceso o facturado</p></div>' +
      '</header>' +
      '<form class="desp-form" id="despPrepForm" autocomplete="off">' +
      '<div class="desp-form-grid">' +
      '<label class="desp-field"><span>ID pedido (IDC)</span>' +
      '<input type="text" id="despIdc" name="idc" inputmode="numeric" placeholder="Ej. 1045821" required></label>' +
      '<label class="desp-field"><span>Número de jaula</span>' +
      '<input type="text" id="despJaula" name="jaula" placeholder="Ej. J-12" required></label>' +
      '<fieldset class="desp-field desp-field--estado"><legend>Estado del pedido</legend>' +
      '<div class="desp-estado-pick">' +
      DS.PREPARADOR_ESTADOS.map(function (id, i) {
        var e = DS.ESTADOS[id];
        return '<label class="desp-radio desp-radio--' + esc(e.color) + '">' +
          '<input type="radio" name="prepEstado" value="' + esc(id) + '"' + (i === 0 ? ' checked' : '') + '>' +
          '<span>' + esc(e.icon) + ' ' + esc(e.label) + '</span></label>';
      }).join('') +
      '</div></fieldset>' +
      '</div>' +
      '<button type="submit" class="btn btn-primary desp-btn-submit">Registrar pedido</button>' +
      '</form>' +
      '<div class="desp-recent">' +
      '<h4>Últimos registrados</h4>' +
      renderPedidosMini(DS.filterPedidos(data.pedidos, { fase: 'preparacion' }).slice(0, 5)
        .concat(DS.filterPedidos(data.pedidos, { estado: 'facturado' }).slice(0, 5)).slice(0, 6)) +
      '</div></section>';
  }

  function renderPedidosMini(list) {
    if (!list.length) {
      return '<p class="desp-muted">Sin pedidos recientes del preparador.</p>';
    }
    return '<ul class="desp-mini-list">' + list.map(function (p) {
      return '<li><strong>' + esc(p.idc) + '</strong> · Jaula ' + esc(p.jaula) + ' · ' +
        estadoBadge(p.estado) + '</li>';
    }).join('') + '</ul>';
  }

  function renderValidador(data, opts) {
    var filterEstado = (opts && opts.filterEstado) || '';
    var filterQ = (opts && opts.filterQ) || '';
    var list = DS.filterPedidos(data.pedidos, { estado: filterEstado, q: filterQ });

    return '<section class="desp-panel desp-panel--val" aria-labelledby="despValTitle">' +
      '<header class="desp-panel-head">' +
      '<div><span class="desp-eyebrow">Panel 2</span>' +
      '<h3 id="despValTitle">Validador</h3>' +
      '<p class="desp-panel-sub">Pedidos del preparador en tiempo real · cambie el estado de validación</p></div>' +
      '<span class="desp-live-badge" title="Sincronización activa"><span class="desp-live-dot"></span> En vivo</span>' +
      '</header>' +
      '<div class="desp-filters">' +
      '<label class="desp-filter"><span>Buscar</span>' +
      '<input type="search" id="despSearch" placeholder="IDC o jaula…" value="' + esc(filterQ) + '"></label>' +
      '<label class="desp-filter"><span>Estado</span>' +
      '<select id="despFilterEstado">' +
      '<option value="">Todos</option>' +
      Object.keys(DS.ESTADOS).map(function (id) {
        var e = DS.ESTADOS[id];
        return '<option value="' + esc(id) + '"' + (filterEstado === id ? ' selected' : '') + '>' +
          esc(e.icon) + ' ' + esc(e.label) + '</option>';
      }).join('') +
      '</select></label>' +
      '</div>' +
      '<div class="desp-table-wrap">' +
      '<table class="desp-table" id="despValTable">' +
      '<thead><tr>' +
      '<th>IDC</th><th>Jaula</th><th>Estado</th><th>Actualizado</th><th>Acción</th><th></th>' +
      '</tr></thead><tbody>' +
      (list.length ? list.map(function (p) { return renderValidadorRow(p, opts); }).join('') :
        '<tr><td colspan="6" class="desp-empty-row">No hay pedidos' +
        (filterEstado || filterQ ? ' con este filtro' : '') + '.</td></tr>') +
      '</tbody></table></div></section>';
  }

  function renderValidadorRow(p, opts) {
    var canValidate = opts && opts.canValidate;
    var selectHtml = '';
    if (canValidate) {
      selectHtml = '<select class="desp-estado-select" data-pedido-id="' + esc(p.id) + '" aria-label="Nuevo estado para ' + esc(p.idc) + '">' +
        '<option value="">Cambiar a…</option>' +
        DS.VALIDADOR_ESTADOS.map(function (id) {
          var e = DS.ESTADOS[id];
          return '<option value="' + esc(id) + '"' + (p.estado === id ? ' disabled' : '') + '>' +
            esc(e.icon) + ' ' + esc(e.label) + '</option>';
        }).join('') +
        '</select>';
    } else {
      selectHtml = '<span class="desp-muted">Sin permiso</span>';
    }
    return '<tr data-pedido-id="' + esc(p.id) + '">' +
      '<td><strong class="desp-idc">' + esc(p.idc) + '</strong></td>' +
      '<td>' + esc(p.jaula) + '</td>' +
      '<td>' + estadoBadge(p.estado) + '</td>' +
      '<td class="desp-dt">' + esc(fmtDt(p.updatedAt)) + '<br><small>' + esc(p.updatedBy) + '</small></td>' +
      '<td>' + selectHtml + '</td>' +
      '<td><button type="button" class="btn btn-ghost desp-btn-hist" data-pedido-id="' + esc(p.id) + '">Historial</button></td>' +
      '</tr>';
  }

  function renderHistorial(pedido) {
    if (!pedido) return '';
    var rows = (pedido.historial || []).map(function (h) {
      return '<tr><td class="desp-dt">' + esc(fmtDt(h.at)) + '</td>' +
        '<td>' + esc(h.usuario) + '</td>' +
        '<td>' + esc(h.panel) + '</td>' +
        '<td>' + esc(DS.formatHistorialEntry(h)) + '</td>' +
        '<td>' + esc(h.nota || '—') + '</td></tr>';
    }).join('');
    return '<div class="desp-hist-modal-inner">' +
      '<header class="desp-hist-head">' +
      '<h4>Pedido ' + esc(pedido.idc) + ' · Jaula ' + esc(pedido.jaula) + '</h4>' +
      '<p>Estado actual: ' + estadoBadge(pedido.estado) + '</p></header>' +
      '<div class="desp-table-wrap"><table class="desp-table desp-table--hist">' +
      '<thead><tr><th>Fecha</th><th>Usuario</th><th>Panel</th><th>Cambio</th><th>Nota</th></tr></thead>' +
      '<tbody>' + (rows || '<tr><td colspan="5" class="desp-empty-row">Sin historial.</td></tr>') + '</tbody></table></div></div>';
  }

  function render(host, data, opts) {
    if (!host) return;
    DS = global.PlatformDespachoStore;
    if (!DS) {
      host.innerHTML = '<div class="module-empty"><p class="module-empty-title">Módulo Despacho no disponible</p></div>';
      return;
    }

    opts = opts || {};
    lastOpts = opts;
    data = data || DS.load();
    var view = opts.view || 'preparador';
    var canValidate = !!opts.canValidate;
    var userName = (opts.user && (opts.user.name || opts.user.username)) || 'Usuario';

    if (unbindSync) {
      unbindSync();
      unbindSync = null;
    }

    var counts = DS.countByEstado(data.pedidos);
    var showInternalTabs = canValidate && opts.internalNav !== false;
    var tabsHtml = '';
    if (showInternalTabs) {
      var tabViews = [
        { id: 'combinado', label: 'Combinado' },
        { id: 'preparador', label: '🔄 Preparador' },
        { id: 'validador', label: '✓ Validador' }
      ];
      tabsHtml = '<nav class="desp-tabs" role="tablist">' +
        tabViews.map(function (t) {
          return '<button type="button" class="desp-tab' + (view === t.id ? ' active' : '') +
            '" data-desp-view="' + esc(t.id) + '" role="tab"' +
            (view === t.id ? ' aria-selected="true"' : '') + '>' + esc(t.label) + '</button>';
        }).join('') +
        '</nav>';
    } else if (!canValidate) {
      tabsHtml = '<nav class="desp-tabs" role="tablist">' +
        '<button type="button" class="desp-tab active" data-desp-view="preparador" role="tab">🔄 Preparador</button></nav>';
    }

    host.innerHTML =
      '<div class="desp-dashboard" id="despDashboard">' +
      '<header class="desp-dash-header">' +
      '<div><span class="desp-dash-eyebrow">300-001 · Despacho</span>' +
      '<h2 class="desp-dash-title">Preparador ↔ Validador</h2>' +
      '<p class="desp-dash-sub">Sincronización automática · ' + esc(String((data.pedidos || []).length)) + ' pedido(s)</p></div>' +
      flujoHtml() +
      '</header>' +
      kpiStrip(counts) +
      tabsHtml +
      '<div class="desp-panels">' +
      (canValidate
        ? (view === 'validador'
          ? renderValidador(data, opts)
          : view === 'preparador'
            ? renderPreparador(data, opts)
            : '<div class="desp-split">' + renderPreparador(data, opts) + renderValidador(data, opts) + '</div>')
        : renderPreparador(data, opts)) +
      '</div>' +
      '<div class="desp-hist-overlay" id="despHistOverlay" hidden aria-hidden="true">' +
      '<div class="desp-hist-dialog" role="dialog" aria-labelledby="despHistTitle">' +
      '<button type="button" class="desp-hist-close" id="despHistClose" aria-label="Cerrar">×</button>' +
      '<div id="despHistBody"></div></div></div>' +
      '</div>';

    bindEvents(host, data, opts, userName);

    unbindSync = DS.bindSync(function (fresh) {
      if (!host.isConnected) return;
      var keepView = host.querySelector('.desp-tab.active');
      var v = keepView ? keepView.getAttribute('data-desp-view') : view;
      var searchEl = host.querySelector('#despSearch');
      var filtEl = host.querySelector('#despFilterEstado');
      render(host, fresh, Object.assign({}, lastOpts, {
        view: v || view,
        filterQ: searchEl ? searchEl.value : (opts.filterQ || ''),
        filterEstado: filtEl ? filtEl.value : (opts.filterEstado || '')
      }));
    });
  }

  function bindEvents(host, data, opts, userName) {
    host.querySelectorAll('.desp-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var v = btn.getAttribute('data-desp-view');
        if (opts.onViewChange) opts.onViewChange(v);
        render(host, DS.load(), Object.assign({}, opts, { view: v }));
      });
    });

    var form = host.querySelector('#despPrepForm');
    if (form) {
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var idc = (host.querySelector('#despIdc') || {}).value;
        var jaula = (host.querySelector('#despJaula') || {}).value;
        var estadoEl = host.querySelector('input[name="prepEstado"]:checked');
        var estado = estadoEl ? estadoEl.value : 'en_proceso';
        var res = DS.registrarPedido(idc, jaula, estado, userName);
        if (!res.ok) {
          toast(res.error, 'warn');
          return;
        }
        toast(res.updated ? 'Pedido actualizado' : 'Pedido registrado', 'success');
        form.reset();
        var firstRadio = host.querySelector('input[name="prepEstado"]');
        if (firstRadio) firstRadio.checked = true;
        render(host, res.data, opts);
      });
    }

    host.querySelectorAll('.desp-estado-select').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var nuevo = sel.value;
        if (!nuevo) return;
        var pedidoId = sel.getAttribute('data-pedido-id');
        var res = DS.cambiarEstado(pedidoId, nuevo, userName);
        if (!res.ok) {
          toast(res.error, 'warn');
          sel.value = '';
          return;
        }
        toast('Estado actualizado: ' + DS.ESTADOS[nuevo].short, 'success');
        render(host, res.data, opts);
      });
    });

    var searchEl = host.querySelector('#despSearch');
    var filtEl = host.querySelector('#despFilterEstado');
    function applyFilters() {
      render(host, DS.load(), Object.assign({}, opts, {
        filterQ: searchEl ? searchEl.value : '',
        filterEstado: filtEl ? filtEl.value : ''
      }));
    }
    if (searchEl) {
      var debounce;
      searchEl.addEventListener('input', function () {
        clearTimeout(debounce);
        debounce = setTimeout(applyFilters, 220);
      });
    }
    if (filtEl) filtEl.addEventListener('change', applyFilters);

    host.querySelectorAll('.desp-btn-hist').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-pedido-id');
        var pedido = (data.pedidos || []).find(function (p) { return p.id === id; });
        if (!pedido) pedido = DS.load().pedidos.find(function (p) { return p.id === id; });
        var overlay = host.querySelector('#despHistOverlay');
        var body = host.querySelector('#despHistBody');
        if (overlay && body) {
          body.innerHTML = renderHistorial(pedido);
          overlay.hidden = false;
          overlay.setAttribute('aria-hidden', 'false');
        }
      });
    });

    var closeHist = host.querySelector('#despHistClose');
    var overlay = host.querySelector('#despHistOverlay');
    if (closeHist && overlay) {
      closeHist.addEventListener('click', function () {
        overlay.hidden = true;
        overlay.setAttribute('aria-hidden', 'true');
      });
      overlay.addEventListener('click', function (ev) {
        if (ev.target === overlay) {
          overlay.hidden = true;
          overlay.setAttribute('aria-hidden', 'true');
        }
      });
    }
  }

  function toast(msg, type) {
    if (global.PlatformToast) {
      if (type === 'success') global.PlatformToast.success(msg, 2800);
      else if (type === 'warn') global.PlatformToast.warning(msg, 4000);
      else global.PlatformToast.info(msg, 3000);
    }
  }

  function destroy() {
    if (unbindSync) {
      unbindSync();
      unbindSync = null;
    }
  }

  global.PlatformDespachoUI = {
    render: render,
    destroy: destroy
  };
})(typeof window !== 'undefined' ? window : this);
