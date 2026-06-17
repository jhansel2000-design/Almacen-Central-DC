/**
 * Tablón informativo — UI pública y panel admin
 */
(function (global) {
  'use strict';

  var esc = global.PanelCore ? global.PanelCore.esc : function (s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  function formatDate(iso) {
    if (!iso) return '';
    try {
      return global.PanelCore.formatDateTime(new Date(iso));
    } catch (e) {
      return String(iso);
    }
  }

  function renderBoard(items) {
    var feed = document.getElementById('hubNewsFeed');
    var empty = document.getElementById('hubNewsEmpty');
    var template = document.getElementById('hubNewsTemplate');
    if (!feed) return;

    var list = items || [];
    if (!list.length) {
      feed.innerHTML = '';
      if (empty) empty.hidden = false;
      if (template) template.hidden = false;
      return;
    }

    if (empty) empty.hidden = true;
    if (template) template.hidden = true;

    var html = '';
    list.forEach(function (item) {
      html += '<article class="hub-news-item' + (item.pinned ? ' hub-news-item--pinned' : '') + '">';
      if (item.pinned) html += '<span class="hub-news-pin" aria-hidden="true">📌</span>';
      html += '<h3 class="hub-news-item-title">' + esc(item.title) + '</h3>';
      if (item.body) {
        html += '<div class="hub-news-item-body">' + esc(item.body).replace(/\n/g, '<br>') + '</div>';
      }
      html += '<footer class="hub-news-item-meta">';
      html += '<time datetime="' + esc(item.publishedAt) + '">' + esc(formatDate(item.publishedAt)) + '</time>';
      if (item.publishedBy) html += '<span class="hub-news-item-by">' + esc(item.publishedBy) + '</span>';
      html += '</footer></article>';
    });
    feed.innerHTML = html;
  }

  function renderAdminPanel(host, options) {
    if (!host) return;
    var items = (options && options.items) || [];
    var actor = (options && options.actor) || 'Administrador';
    var onSave = options && options.onSave;
    var onDelete = options && options.onDelete;
    var setupRequired = options && options.setupRequired;

    var html = '<div class="hub-news-admin">';
    html += '<p class="admin-hint">Publica avisos visibles en la <strong>web principal</strong> (tablón antes de elegir portal). Solo usuarios con rol <strong>Administrador</strong>.</p>';
    if (setupRequired) {
      html += '<div class="admin-alert admin-alert-warn"><strong>Supabase</strong><p>Ejecute <code>SETUP-HUB-NEWS-SUPABASE.bat</code> para que todos vean las mismas noticias en la nube.</p></div>';
    }
    html += '<form id="hubNewsForm" class="admin-form hub-news-form">';
    html += '<input type="hidden" id="hubNewsEditId" value="">';
    html += '<label for="hubNewsTitle">Título del aviso</label>';
    html += '<input id="hubNewsTitle" maxlength="120" placeholder="Ej.: Mantenimiento programado sábado" required>';
    html += '<label for="hubNewsBody">Detalle (opcional)</label>';
    html += '<textarea id="hubNewsBody" rows="4" maxlength="2000" placeholder="Información adicional para el personal…"></textarea>';
    html += '<label class="hub-news-check"><input type="checkbox" id="hubNewsPinned"> Fijar arriba del tablón</label>';
    html += '<div class="admin-btn-row">';
    html += '<button type="submit" class="btn btn-primary" id="hubNewsSubmit">Publicar aviso</button>';
    html += '<button type="button" class="btn" id="hubNewsCancelEdit" hidden>Cancelar edición</button>';
    html += '</div></form>';
    html += '<div class="status-msg" id="hubNewsAdminStatus"></div>';
    html += '<h4 class="admin-subtitle">Avisos publicados</h4>';

    if (!items.length) {
      html += '<p class="admin-empty">No hay noticias activas.</p>';
    } else {
      html += '<div class="admin-table-wrap"><table class="data-table hub-news-admin-table"><thead><tr>';
      html += '<th>Título</th><th>Fecha</th><th>Autor</th><th></th></tr></thead><tbody>';
      items.forEach(function (item) {
        html += '<tr><td>' + (item.pinned ? '📌 ' : '') + esc(item.title) + '</td>';
        html += '<td>' + esc(formatDate(item.publishedAt)) + '</td>';
        html += '<td>' + esc(item.publishedBy || actor) + '</td>';
        html += '<td class="admin-actions">';
        html += '<button type="button" class="btn btn-sm" data-edit-news="' + esc(item.id) + '">Editar</button> ';
        html += '<button type="button" class="btn btn-sm" data-del-news="' + esc(item.id) + '">Quitar</button>';
        html += '</td></tr>';
      });
      html += '</tbody></table></div>';
    }
    html += '</div>';
    host.innerHTML = html;

    var form = host.querySelector('#hubNewsForm');
    var statusEl = host.querySelector('#hubNewsAdminStatus');
    var editId = host.querySelector('#hubNewsEditId');
    var titleEl = host.querySelector('#hubNewsTitle');
    var bodyEl = host.querySelector('#hubNewsBody');
    var pinnedEl = host.querySelector('#hubNewsPinned');
    var submitBtn = host.querySelector('#hubNewsSubmit');
    var cancelBtn = host.querySelector('#hubNewsCancelEdit');

    function setStatus(msg, isErr) {
      if (!statusEl) return;
      statusEl.textContent = msg || '';
      statusEl.className = 'status-msg show ' + (isErr ? 'err' : 'ok');
    }

    function resetForm() {
      if (editId) editId.value = '';
      if (titleEl) titleEl.value = '';
      if (bodyEl) bodyEl.value = '';
      if (pinnedEl) pinnedEl.checked = false;
      if (submitBtn) submitBtn.textContent = 'Publicar aviso';
      if (cancelBtn) cancelBtn.hidden = true;
    }

    if (form && onSave) {
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        onSave({
          id: editId ? editId.value : '',
          title: titleEl ? titleEl.value : '',
          body: bodyEl ? bodyEl.value : '',
          pinned: pinnedEl ? pinnedEl.checked : false
        }).then(function (res) {
          if (!res.ok) {
            setStatus(res.message || 'No se pudo guardar.', true);
            return;
          }
          setStatus(res.message || 'Aviso publicado.', false);
          resetForm();
        });
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', resetForm);
    }

    host.querySelectorAll('[data-edit-news]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-edit-news');
        var item = items.find(function (n) { return n.id === id; });
        if (!item) return;
        if (editId) editId.value = item.id;
        if (titleEl) titleEl.value = item.title;
        if (bodyEl) bodyEl.value = item.body || '';
        if (pinnedEl) pinnedEl.checked = !!item.pinned;
        if (submitBtn) submitBtn.textContent = 'Guardar cambios';
        if (cancelBtn) cancelBtn.hidden = false;
        if (titleEl) titleEl.focus();
      });
    });

    host.querySelectorAll('[data-del-news]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-del-news');
        if (!id || !confirm('¿Quitar este aviso del tablón?')) return;
        if (onDelete) {
          onDelete(id).then(function (res) {
            if (!res.ok) setStatus(res.message || 'No se pudo quitar.', true);
            else setStatus('Aviso retirado del tablón.', false);
          });
        }
      });
    });
  }

  global.PlatformHubNewsUI = {
    renderBoard: renderBoard,
    renderAdminPanel: renderAdminPanel
  };
})(typeof window !== 'undefined' ? window : this);
