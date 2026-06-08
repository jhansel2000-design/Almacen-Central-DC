/**
 * UI del panel de administración
 */
(function (global) {
  'use strict';

  var esc = global.PanelCore ? global.PanelCore.esc : function (s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  var TAB_PANE_IDS = {
    excel: 'adminPaneExcel',
    sistema: 'adminPaneSistema',
    herramientas: 'adminPaneHerramientas',
    users: 'adminPaneUsers',
    areas: 'adminPaneAreas',
    config: 'adminPaneConfig',
    logs: 'adminPaneLogs',
    ai: 'adminPaneAi'
  };

  function statusTag(ok, text) {
    return '<span class="admin-status-tag ' + (ok ? 'ok' : 'err') + '">' + esc(text) + '</span>';
  }

  function renderUsersTable(container, onEdit, onDelete) {
    var users = global.PlatformAdmin.getUsers();
    var html = '<div class="admin-table-wrap"><table class="data-table"><thead><tr>' +
      '<th>Usuario</th><th>Nombre</th><th>Rol</th><th>Áreas</th><th>Estado</th><th></th></tr></thead><tbody>';
    users.forEach(function (u) {
      html += '<tr><td>' + esc(u.username) + '</td><td>' + esc(u.name) + '</td><td>' +
        esc(global.PlatformAdmin.ROLE_LABELS[u.role] || u.role) + '</td><td>' +
        esc((u.areas || []).join(', ') || 'Todas') + '</td><td>' +
        (u.active ? 'Activo' : 'Inactivo') + '</td><td class="admin-actions">' +
        '<button type="button" class="btn btn-sm" data-edit="' + esc(u.id) + '">Editar</button> ' +
        '<button type="button" class="btn btn-sm" data-del="' + esc(u.id) + '">Eliminar</button></td></tr>';
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
    container.querySelectorAll('[data-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () { onEdit(btn.getAttribute('data-edit')); });
    });
    container.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', function () { onDelete(btn.getAttribute('data-del')); });
    });
  }

  function renderAreasTable(container, onEdit, onDelete) {
    var areas = global.PlatformAdmin.getAreas();
    var html = '<div class="admin-table-wrap"><table class="data-table"><thead><tr>' +
      '<th>Área</th><th>Descripción</th><th></th></tr></thead><tbody>';
    areas.forEach(function (a) {
      html += '<tr><td>' + esc(a.name) + '</td><td>' + esc(a.description) + '</td>' +
        '<td class="admin-actions">' +
        '<button type="button" class="btn btn-sm" data-edit="' + esc(a.id) + '">Editar</button> ' +
        '<button type="button" class="btn btn-sm" data-del="' + esc(a.id) + '">Eliminar</button></td></tr>';
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
    container.querySelectorAll('[data-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () { onEdit(btn.getAttribute('data-edit')); });
    });
    container.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', function () { onDelete(btn.getAttribute('data-del')); });
    });
  }

  function renderLogs(container) {
    var logs = global.PlatformAdmin.getLogs();
    if (!logs.length) {
      container.innerHTML = '<p class="admin-empty">Sin registros en el historial.</p>';
      return;
    }
    var html = '<div class="admin-logs">';
    logs.slice(0, 50).forEach(function (log) {
      html += '<div class="admin-log-item"><span class="admin-log-time">' +
        esc(global.PanelCore.formatDateTime(new Date(log.at))) + '</span> ' +
        '<strong>' + esc(log.user) + '</strong> — ' + esc(log.action) +
        (log.detail ? ': <span>' + esc(log.detail) + '</span>' : '') + '</div>';
    });
    html += '</div>';
    container.innerHTML = html;
  }

  function renderSystemPanel(container) {
    if (!container || !global.PlatformAdminTools) return;
    var diag = global.PlatformAdminTools.runDiagnostics();
    var html = '<div class="admin-diag-header">' +
      statusTag(diag.ok, diag.ok ? 'Sistema OK' : 'Errores detectados') +
      '<button type="button" class="btn btn-sm" id="btnRefreshDiag">Volver a comprobar</button></div>';

    if (diag.errors.length) {
      html += '<div class="admin-alert admin-alert-err"><strong>Errores</strong><ul>';
      diag.errors.forEach(function (e) { html += '<li>' + esc(e) + '</li>'; });
      html += '</ul></div>';
    }
    if (diag.warnings.length) {
      html += '<div class="admin-alert admin-alert-warn"><strong>Avisos</strong><ul>';
      diag.warnings.forEach(function (w) { html += '<li>' + esc(w) + '</li>'; });
      html += '</ul></div>';
    }

    html += '<h4 class="admin-subtitle">Módulos JavaScript</h4><div class="admin-check-grid">';
    diag.modules.forEach(function (m) {
      html += '<div class="admin-check-item">' + statusTag(m.ok, m.label) + '</div>';
    });
    html += '</div>';

    html += '<h4 class="admin-subtitle">Bibliotecas</h4><div class="admin-check-grid">';
    diag.libraries.forEach(function (l) {
      html += '<div class="admin-check-item">' + statusTag(l.ok, l.name) + '</div>';
    });
    html += '</div>';

    html += '<h4 class="admin-subtitle">Estado de datos publicados</h4><div class="admin-module-status-grid">';
    var ms = diag.moduleStatus;
    html += '<div class="admin-module-status-card prod"><strong>Productividad</strong><p>' +
      (ms.productividad.loaded ? statusTag(true, ms.productividad.rows + ' registros') : statusTag(false, 'Sin datos')) +
      '</p><p class="admin-hint small">' + esc(ms.productividad.fileName || '—') + '</p></div>';
    html += '<div class="admin-module-status-card ops"><strong>Operaciones</strong><p>' +
      (ms.operaciones.loaded ? statusTag(true, ms.operaciones.rows + ' registros') : statusTag(false, 'Sin datos')) +
      '</p><p class="admin-hint small">' + esc(ms.operaciones.fileName || '—') +
      (ms.operaciones.format ? ' · ' + esc(ms.operaciones.format) : '') + '</p></div>';
    html += '</div>';

    html += '<h4 class="admin-subtitle">Almacenamiento local</h4>';
    html += '<p class="admin-hint">Total: <strong>' + esc(global.PlatformAdminTools.formatBytes(diag.storage.totalBytes)) + '</strong></p>';
    html += '<div class="admin-table-wrap"><table class="data-table admin-storage-table"><thead><tr>' +
      '<th>Clave</th><th>Tamaño</th><th>Resumen</th></tr></thead><tbody>';
    diag.storage.items.forEach(function (item) {
      html += '<tr><td>' + esc(item.label) + '</td><td>' + esc(global.PlatformAdminTools.formatBytes(item.bytes)) +
        '</td><td>' + esc(item.summary) + '</td></tr>';
    });
    html += '</tbody></table></div>';

    container.innerHTML = html;
    var refreshBtn = container.querySelector('#btnRefreshDiag');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () { renderSystemPanel(container); });
    }
  }

  function renderToolsPanel(container, handlers) {
    if (!container) return;
    handlers = handlers || {};
    var html =
      '<div class="admin-tools-section">' +
      '<h4 class="admin-subtitle">Copia de seguridad</h4>' +
      '<p class="admin-hint small">Exporta configuración, datos de ambos módulos, usuarios y áreas en un archivo JSON.</p>' +
      '<div class="admin-btn-row">' +
      '<button type="button" class="btn btn-primary" id="btnAdminBackup">Descargar backup (.json)</button>' +
      '<label class="btn btn-admin-file">Restaurar backup<input type="file" id="adminBackupFile" accept=".json,application/json" class="is-hidden"></label>' +
      '</div></div>' +
      '<hr class="admin-divider">' +
      '<div class="admin-tools-section">' +
      '<h4 class="admin-subtitle">Limpieza de datos</h4>' +
      '<p class="admin-hint small">Elimina solo los datos publicados del módulo indicado. No borra usuarios ni configuración.</p>' +
      '<div class="admin-btn-row">' +
      '<button type="button" class="btn btn-warn" id="btnClearProd">Limpiar productividad</button>' +
      '<button type="button" class="btn btn-warn" id="btnClearOps">Limpiar operaciones</button>' +
      '<button type="button" class="btn btn-danger" id="btnClearAll">Limpiar todos los módulos</button>' +
      '</div></div>' +
      '<hr class="admin-divider">' +
      '<div class="admin-tools-section">' +
      '<h4 class="admin-subtitle">Mantenimiento</h4>' +
      '<div class="admin-btn-row">' +
      '<button type="button" class="btn" id="btnResetConfig">Restablecer configuración</button>' +
      '<button type="button" class="btn" id="btnPurgeLogs">Vaciar historial</button>' +
      '</div></div>' +
      '<div class="status-msg" id="adminToolsStatus"></div>';

    container.innerHTML = html;

    function bind(id, ev, fn) {
      var el = container.querySelector(id);
      if (el) el.addEventListener(ev, fn);
    }

    bind('#btnAdminBackup', 'click', function () {
      if (handlers.onBackup) handlers.onBackup();
    });
    bind('#adminBackupFile', 'change', function (ev) {
      if (handlers.onRestore && ev.target.files[0]) handlers.onRestore(ev.target.files[0]);
      ev.target.value = '';
    });
    bind('#btnClearProd', 'click', function () { if (handlers.onClear) handlers.onClear('productividad'); });
    bind('#btnClearOps', 'click', function () { if (handlers.onClear) handlers.onClear('operaciones'); });
    bind('#btnClearAll', 'click', function () { if (handlers.onClear) handlers.onClear('all'); });
    bind('#btnResetConfig', 'click', function () { if (handlers.onResetConfig) handlers.onResetConfig(); });
    bind('#btnPurgeLogs', 'click', function () { if (handlers.onPurgeLogs) handlers.onPurgeLogs(); });
  }

  function renderExcelPreview(container, result) {
    if (!container) return;
    if (!result) {
      container.innerHTML = '';
      container.classList.remove('show');
      return;
    }
    container.classList.add('show');
    var html = '<div class="admin-preview ' + (result.ok ? 'ok' : 'err') + '">';
    html += '<strong>' + (result.ok ? '✓ Validación correcta' : '✗ Validación fallida') + '</strong>';
    if (result.detected) html += '<p>Tipo detectado: <code>' + esc(result.detected) + '</code></p>';
    if (result.sheetNames && result.sheetNames.length) {
      html += '<p>Hojas: ' + esc(result.sheetNames.join(', ')) + '</p>';
    }
    if (result.summary) {
      html += '<ul class="admin-preview-summary">';
      Object.keys(result.summary).forEach(function (k) {
        html += '<li>' + esc(k) + ': <strong>' + esc(result.summary[k]) + '</strong></li>';
      });
      html += '</ul>';
    }
    if (result.errors && result.errors.length) {
      html += '<ul class="admin-preview-errors">';
      result.errors.forEach(function (e) { html += '<li>' + esc(e) + '</li>'; });
      html += '</ul>';
    }
    html += '</div>';
    container.innerHTML = html;
  }

  function switchTab(tabId) {
    var paneId = TAB_PANE_IDS[tabId];
    document.querySelectorAll('.admin-tab-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
    });
    document.querySelectorAll('.admin-tab-pane').forEach(function (p) {
      p.classList.toggle('active', p.id === paneId);
    });
    return tabId;
  }

  global.PlatformAdminUI = {
    TAB_PANE_IDS: TAB_PANE_IDS,
    renderUsersTable: renderUsersTable,
    renderAreasTable: renderAreasTable,
    renderLogs: renderLogs,
    renderSystemPanel: renderSystemPanel,
    renderToolsPanel: renderToolsPanel,
    renderExcelPreview: renderExcelPreview,
    switchTab: switchTab
  };
})(typeof window !== 'undefined' ? window : this);
