/**
 * Inventario RF — escritorio web (Conciliación · Exactitud + Auditoría)
 * Lee conteos APK en vivo desde Supabase. No modifica la APK.
 */
(function (global) {
  'use strict';

  var CONC, SYNC, CORE, toastFn, escFn;

  var desk = {
    tab: 'cuadre',
    workspace: 'conciliacion',
    sistemaRows: [],
    meta: {},
    concRows: [],
    liveRows: [],
    stats: { ok: 0, revisar: 0, total: 0, accuracy: 0 }
  };

  function $(id) { return document.getElementById(id); }

  function fmtQty(v) {
    if (v == null || v === '') return '—';
    var n = Number(v);
    return isNaN(n) ? '—' : String(n);
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('es-DO', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      });
    } catch (e) { return String(iso); }
  }

  function metaText() {
    if (!desk.meta || !desk.meta.fileName) {
      return 'Exporte «Inventario disponible» de Dynamics · se guarda en este navegador hasta reemplazarlo';
    }
    return (desk.meta.formatLabel || 'Excel') + ' · ' + desk.meta.count + ' líneas CJ · importado ' +
      fmtDate(desk.meta.importedAt) + ' · guardado hasta cambiar';
  }

  function renderExcelCard() {
    var card = $('invDeskExcelCard');
    var nameEl = $('invDeskExcelName');
    var metaEl = $('invDeskExcelMeta');
    var btnLoad = $('invBtnLoadSistema');
    var btnReplace = $('invBtnReplaceSistema');
    var hasFile = !!(desk.meta && desk.meta.fileName && desk.sistemaRows.length);
    if (card) card.classList.toggle('is-loaded', hasFile);
    if (nameEl) {
      nameEl.textContent = hasFile
        ? desk.meta.fileName
        : 'Sin inventario de sistema cargado';
    }
    if (metaEl) metaEl.textContent = metaText();
    if (btnLoad) btnLoad.textContent = hasFile ? 'Ver / recargar' : 'Cargar Excel';
    if (btnReplace) btnReplace.hidden = !hasFile;
  }

  function renderAccVisual() {
    var s = desk.stats;
    var pct = s.total ? s.accuracy : 0;
    var ring = $('invDeskAccRing');
    var ringVal = $('invDeskAccRingVal');
    var bar = $('invDeskAccBar');
    if (ring) ring.style.setProperty('--acc-pct', String(pct));
    if (ringVal) ringVal.textContent = s.total ? (s.accuracy + '%') : '—';
    if (bar) bar.style.width = (s.total ? s.accuracy : 0) + '%';
  }

  function renderTabHint() {
    var el = $('invDeskTabHint');
    if (!el) return;
    if (desk.tab === 'vivo') {
      el.textContent = 'Ubicaciones que van contando en piso ahora mismo (último registro por ubicación · CJ).';
    } else if (desk.tab === 'sistema') {
      el.textContent = hasSistema()
        ? 'Inventario exportado de Dynamics guardado localmente (' + desk.sistemaRows.length + ' líneas).'
        : 'Cargue el Excel «Inventario disponible» — quedará guardado hasta que lo reemplace.';
    } else if (desk.workspace === 'auditoria') {
      el.textContent = 'Solo ubicaciones REVISAR · compare con el Excel de sistema y el conteo en vivo.';
    } else {
      el.textContent = 'Cuadre automático: Ok = coincide en CJ · Revisar = diferencia, sin conteo o extra.';
    }
  }

  function hasSistema() {
    return !!(desk.sistemaRows && desk.sistemaRows.length);
  }

  function renderKpis() {
    var s = desk.stats;
    if ($('invDeskKpiOk')) $('invDeskKpiOk').textContent = String(s.ok);
    if ($('invDeskKpiRev')) $('invDeskKpiRev').textContent = String(s.revisar);
    if ($('invDeskKpiTotal')) $('invDeskKpiTotal').textContent = String(s.total);
    if ($('invDeskKpiAcc')) $('invDeskKpiAcc').textContent = s.total ? (s.accuracy + '%') : '—';
    if ($('invDeskKpiLive')) $('invDeskKpiLive').textContent = String((desk.liveRows || []).length);
    renderExcelCard();
    renderAccVisual();
    renderTabHint();
    var live = $('invDeskLive');
    if (live) {
      live.textContent = SYNC && SYNC.isOnline && SYNC.isOnline() ? '● Conteo en vivo' : '○ Sin enlace en vivo';
      live.classList.toggle('is-on', !!(SYNC && SYNC.isOnline && SYNC.isOnline()));
    }
  }

  function rowsForTab() {
    if (desk.tab === 'vivo') {
      return desk.liveRows.map(function (r) {
        return {
          location: r.location,
          barcode: r.barcode,
          product: r.product,
          matricula: r.matricula,
          pack: r.pack || 'CJ',
          qtySistema: null,
          qtyContada: r.qtyCj,
          status: 'EN VIVO',
          userId: r.userId,
          scannedAt: r.scannedAt
        };
      });
    }
    if (desk.tab === 'sistema') {
      return desk.sistemaRows.map(function (r) {
        return {
          location: r.location,
          barcode: r.barcode,
          product: r.product,
          matricula: r.matricula,
          pack: r.pack || 'CJ',
          qtySistema: r.qtyCj,
          qtyContada: null,
          status: 'SISTEMA',
          userId: '',
          scannedAt: ''
        };
      });
    }
    if (desk.workspace === 'auditoria') {
      return CONC.filterRows(desk.concRows, 'revisar');
    }
    return desk.concRows;
  }

  function renderTable() {
    var tbody = $('invDeskTbody');
    if (!tbody) return;
    var rows = rowsForTab();
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="10" class="inv-empty">Sin datos para esta vista.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (r) {
      var rowCls = 'row-live';
      if (r.status === 'Ok') rowCls = 'row-ok';
      else if (r.status === 'REVISAR') rowCls = 'row-revisar';
      var stCls = r.status === 'Ok' ? 'st-ok' : (r.status === 'REVISAR' ? 'st-revisar' : '');
      var qtyCls = (desk.tab === 'cuadre' && r.status === 'REVISAR') ? ' num qty-hi' : ' num';
      return '<tr class="' + rowCls + '">' +
        '<td>' + escFn(r.location) + '</td>' +
        '<td>' + escFn(r.barcode) + '</td>' +
        '<td>' + escFn(r.product) + '</td>' +
        '<td>' + escFn(r.matricula) + '</td>' +
        '<td>' + escFn(r.pack) + '</td>' +
        '<td class="num">' + fmtQty(r.qtySistema) + '</td>' +
        '<td class="' + qtyCls.trim() + '">' + fmtQty(r.qtyContada) + '</td>' +
        '<td class="' + stCls + '">' + escFn(r.status) + '</td>' +
        '<td>' + escFn(r.userId) + '</td>' +
        '<td>' + fmtDate(r.scannedAt) + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderDesk() {
    renderKpis();
    document.querySelectorAll('.inv-desk-tab').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-desk-tab') === desk.tab);
    });
    var title = $('invDeskTitle');
    var sub = $('invDeskSub');
    var logo = $('invDeskLogo');
    if (desk.workspace === 'auditoria') {
      if (title) title.textContent = 'Auditoría de conteo';
      if (sub) sub.textContent = 'Ubicaciones REVISAR · supervisión en tiempo real';
      if (logo) logo.src = 'assets/img/icon-auditoria.svg?v=1';
    } else {
      if (title) title.textContent = 'Conciliación · Exactitud';
      if (sub) sub.textContent = 'Dashboard de exactitud · sistema vs conteo CJ';
      if (logo) logo.src = 'assets/img/icon-exactitud.svg?v=1';
    }
    renderTable();
  }

  function refreshDesk() {
    if (!SYNC || !CONC) return Promise.resolve();
    return SYNC.fetchEntries().then(function (entries) {
      var scanMap = CONC.aggregateScans(entries);
      desk.liveRows = CONC.scansToLiveRows(scanMap);
      desk.concRows = CONC.buildConciliation(desk.sistemaRows, scanMap);
      desk.stats = CONC.dashboardStats(desk.concRows);
      renderDesk();
    });
  }

  function setDeskTab(tab) {
    desk.tab = tab;
    renderDesk();
  }

  function setWorkspace(ws) {
    desk.workspace = ws || 'conciliacion';
    if (desk.workspace === 'auditoria') desk.tab = 'cuadre';
  }

  function loadSistemaFile(file) {
    if (!file || !CONC) return;
    if (!global.XLSX) {
      toastFn('SheetJS no cargó. Revise conexión e intente de nuevo.', 'err');
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var wb = global.XLSX.read(reader.result, { type: 'array' });
        var parsed = CONC.parseWorkbook(wb, file.name);
        desk.sistemaRows = parsed.rows || [];
        desk.meta = parsed.meta || {};
        CONC.saveSistemaCache(desk.sistemaRows, desk.meta);
        toastFn('Guardado: ' + desk.sistemaRows.length + ' líneas (CJ) · permanece hasta reemplazar', 'ok');
        refreshDesk();
      } catch (e) {
        toastFn('No se pudo leer el Excel', 'err');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function exportCuadre() {
    var rows = desk.workspace === 'auditoria'
      ? CONC.filterRows(desk.concRows, 'revisar')
      : desk.concRows;
    if (!rows.length) {
      toastFn('No hay datos para exportar', 'err');
      return;
    }
    var name = 'cuadre-inventario-dc-' + new Date().toISOString().slice(0, 10);
    if (CONC.exportCuadreXlsx(rows, name + '.xlsx')) {
      toastFn('Excel exportado', 'ok');
      return;
    }
    var csv = CONC.exportCuadreCsv(rows);
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name + '.csv';
    a.click();
    toastFn('CSV exportado', 'ok');
  }

  function bindDeskEvents() {
    document.querySelectorAll('[data-desk-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setDeskTab(btn.getAttribute('data-desk-tab'));
      });
    });
    var fileInput = $('invSistemaFile');
    var btnLoad = $('invBtnLoadSistema');
    var btnReplace = $('invBtnReplaceSistema');
    if (btnLoad && fileInput) {
      btnLoad.addEventListener('click', function () { fileInput.click(); });
      if (btnReplace) btnReplace.addEventListener('click', function () { fileInput.click(); });
      fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files[0]) loadSistemaFile(fileInput.files[0]);
        fileInput.value = '';
      });
    }
    var btnExport = $('invBtnExportCuadre');
    if (btnExport) btnExport.addEventListener('click', exportCuadre);
    var btnRefresh = $('invBtnRefreshDesk');
    if (btnRefresh) btnRefresh.addEventListener('click', function () { refreshDesk(); });
  }

  function init(deps) {
    CONC = deps.CONC;
    SYNC = deps.SYNC;
    CORE = deps.CORE;
    toastFn = deps.toast || function () {};
    escFn = deps.esc || function (s) { return String(s || ''); };
    bindDeskEvents();
    var cached = CONC.loadSistemaCache();
    desk.sistemaRows = cached.rows || [];
    desk.meta = cached.meta || {};
  }

  function deskShell() {
    return $('ixApp') || $('invApp');
  }

  function showDesk(workspace) {
    setWorkspace(workspace);
    var shell = deskShell();
    if (shell) shell.classList.add('inv-app-shell--desk');
    var concEl = $('invViewConciliacion');
    if (concEl) concEl.hidden = false;
    desk.tab = workspace === 'auditoria' ? 'cuadre' : desk.tab;
    refreshDesk();
  }

  function hideDeskLayout() {
    var shell = deskShell();
    if (shell) shell.classList.remove('inv-app-shell--desk');
    var concEl = $('invViewConciliacion');
    if (concEl) concEl.hidden = true;
  }

  global.PlatformInventarioDesk = {
    init: init,
    refreshDesk: refreshDesk,
    showDesk: showDesk,
    hideDeskLayout: hideDeskLayout,
    setWorkspace: setWorkspace
  };
})(typeof window !== 'undefined' ? window : this);
