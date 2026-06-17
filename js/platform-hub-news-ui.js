/**
 * Tablón informativo — UI pública y panel admin
 */
(function (global) {
  'use strict';

  var esc = global.PanelCore ? global.PanelCore.esc : function (s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  var CTA_BY_THEME = {
    despacho: 'Entrar a despacho →',
    ops: 'Entrar a operaciones →',
    mando: 'Entrar al mando →',
    inventario: 'Entrar a inventario →'
  };

  var TAG_BY_THEME = {
    despacho: 'Portal de Despacho',
    ops: 'Operaciones de Piso',
    mando: 'Control de Mando',
    inventario: 'Inventario RF'
  };

  function formatDate(iso) {
    if (!iso) return '';
    try {
      return global.PanelCore.formatDateTime(new Date(iso));
    } catch (e) {
      return String(iso);
    }
  }

  function renderBodyHtml(body) {
    var lines = String(body || '').split('\n');
    var html = '';
    var inList = false;
    lines.forEach(function (line) {
      var trimmed = line.trim();
      if (!trimmed) {
        if (inList) { html += '</ul>'; inList = false; }
        return;
      }
      if (trimmed.indexOf('•') === 0) {
        if (!inList) { html += '<ul class="hub-news-item-list">'; inList = true; }
        html += '<li>' + esc(trimmed.replace(/^•\s*/, '')) + '</li>';
        return;
      }
      if (inList) { html += '</ul>'; inList = false; }
      if (/^qué puedes hacer:/i.test(trimmed)) {
        html += '<p class="hub-news-item-lead"><strong>' + esc(trimmed) + '</strong></p>';
      } else {
        html += '<p class="hub-news-item-intro">' + esc(trimmed) + '</p>';
      }
    });
    if (inList) html += '</ul>';
    return html;
  }

  function renderItemHtml(item, isActive) {
    var theme = item.theme || '';
    var classes = 'hub-news-item hub-news-slide';
    if (isActive) classes += ' is-active';
    if (item.pinned) classes += ' hub-news-item--pinned';
    if (theme) classes += ' hub-news-item--portal hub-news-item--' + theme;
    if (item.imageUrl) classes += ' hub-news-item--has-media';

    var html = '<article class="' + classes + '" aria-hidden="' + (isActive ? 'false' : 'true') + '">';
    if (item.pinned) html += '<span class="hub-news-pin" aria-hidden="true">📌</span>';

    if (item.imageUrl) {
      html += '<div class="hub-news-item-media">';
      html += '<img src="' + esc(item.imageUrl) + '" alt="" loading="lazy" decoding="async">';
      html += '</div>';
    }

    html += '<div class="hub-news-item-content">';
    if (theme && TAG_BY_THEME[theme]) {
      html += '<span class="hub-news-item-tag">' + esc(TAG_BY_THEME[theme]) + '</span>';
    }
    html += '<h3 class="hub-news-item-title">' + esc(item.title) + '</h3>';
    if (item.body) html += '<div class="hub-news-item-body">' + renderBodyHtml(item.body) + '</div>';

    if (item.linkUrl) {
      var cta = CTA_BY_THEME[theme] || 'Abrir portal →';
      html += '<a class="hub-news-item-cta" href="' + esc(item.linkUrl) + '">' + esc(cta) + '</a>';
    }

    html += '<footer class="hub-news-item-meta">';
    html += '<time datetime="' + esc(item.publishedAt) + '">' + esc(formatDate(item.publishedAt)) + '</time>';
    if (item.publishedBy) html += '<span class="hub-news-item-by">' + esc(item.publishedBy) + '</span>';
    html += '</footer></div></article>';
    return html;
  }

  var carouselTimer = null;
  var carouselIndex = 0;
  var carouselPaused = false;
  var ROTATE_MS = 9000;

  function stopCarousel() {
    if (carouselTimer) {
      clearInterval(carouselTimer);
      carouselTimer = null;
    }
  }

  function setActiveSlide(feed, index, total) {
    var slides = feed.querySelectorAll('.hub-news-slide');
    var dots = feed.querySelectorAll('.hub-news-carousel-dot');
    var counter = feed.querySelector('.hub-news-carousel-counter');
    carouselIndex = ((index % total) + total) % total;

    slides.forEach(function (slide, i) {
      var active = i === carouselIndex;
      slide.classList.toggle('is-active', active);
      slide.setAttribute('aria-hidden', active ? 'false' : 'true');
      slide.style.visibility = active ? 'visible' : 'hidden';
    });
    dots.forEach(function (dot, i) {
      var active = i === carouselIndex;
      dot.classList.toggle('is-active', active);
      dot.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    if (counter) counter.textContent = (carouselIndex + 1) + ' / ' + total;
  }

  function startCarousel(feed, total) {
    stopCarousel();
    if (total <= 1) return;
    if (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    carouselTimer = setInterval(function () {
      if (carouselPaused) return;
      setActiveSlide(feed, carouselIndex + 1, total);
    }, ROTATE_MS);
  }

  function bindCarousel(feed, total) {
    if (total <= 1) return;

    feed.querySelectorAll('.hub-news-carousel-dot').forEach(function (dot) {
      dot.addEventListener('click', function () {
        var idx = parseInt(dot.getAttribute('data-index'), 10);
        if (!isNaN(idx)) {
          setActiveSlide(feed, idx, total);
          startCarousel(feed, total);
        }
      });
    });

    var prev = feed.querySelector('.hub-news-carousel-prev');
    var next = feed.querySelector('.hub-news-carousel-next');
    if (prev) {
      prev.addEventListener('click', function () {
        setActiveSlide(feed, carouselIndex - 1, total);
        startCarousel(feed, total);
      });
    }
    if (next) {
      next.addEventListener('click', function () {
        setActiveSlide(feed, carouselIndex + 1, total);
        startCarousel(feed, total);
      });
    }

    feed.addEventListener('mouseenter', function () { carouselPaused = true; });
    feed.addEventListener('mouseleave', function () { carouselPaused = false; });
    feed.addEventListener('focusin', function () { carouselPaused = true; });
    feed.addEventListener('focusout', function () { carouselPaused = false; });
  }

  function renderBoard(items) {
    var feed = document.getElementById('hubNewsFeed');
    var empty = document.getElementById('hubNewsEmpty');
    if (!feed) return;

    stopCarousel();
    var list = items || [];

    if (!list.length) {
      feed.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }

    if (empty) empty.hidden = true;

    var html = '<div class="hub-news-carousel" role="region" aria-label="Noticias del almacén" aria-live="polite">';
    html += '<div class="hub-news-carousel-track">';

    list.forEach(function (item, i) {
      html += renderItemHtml(item, i === 0);
    });

    html += '</div>';

    if (list.length > 1) {
      html += '<div class="hub-news-carousel-nav">';
      html += '<button type="button" class="hub-news-carousel-arrow hub-news-carousel-prev" aria-label="Noticia anterior">‹</button>';
      html += '<div class="hub-news-carousel-dots" role="tablist" aria-label="Elegir noticia">';
      list.forEach(function (item, i) {
        html += '<button type="button" class="hub-news-carousel-dot' + (i === 0 ? ' is-active' : '') + '" data-index="' + i + '" role="tab" aria-label="' + esc(item.title) + '" aria-selected="' + (i === 0 ? 'true' : 'false') + '"></button>';
      });
      html += '</div>';
      html += '<span class="hub-news-carousel-counter" aria-live="off">1 / ' + list.length + '</span>';
      html += '<button type="button" class="hub-news-carousel-arrow hub-news-carousel-next" aria-label="Siguiente noticia">›</button>';
      html += '</div>';
    }

    html += '</div>';
    feed.innerHTML = html;

    carouselIndex = 0;
    carouselPaused = false;
    bindCarousel(feed, list.length);
    startCarousel(feed, list.length);
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
    html += '<input id="hubNewsTitle" maxlength="120" placeholder="Ej.: Portal de Despacho" required>';
    html += '<label for="hubNewsBody">Detalle</label>';
    html += '<textarea id="hubNewsBody" rows="6" maxlength="2000" placeholder="Descripción y lista con • para cada punto…"></textarea>';
    html += '<div class="admin-form-row">';
    html += '<div><label for="hubNewsImage">Imagen (ruta)</label>';
    html += '<input id="hubNewsImage" maxlength="240" placeholder="assets/img/login-dispatch-poster.jpg"></div>';
    html += '<div><label for="hubNewsLink">Enlace portal</label>';
    html += '<input id="hubNewsLink" maxlength="240" placeholder="despacho.html"></div></div>';
    html += '<label for="hubNewsTheme">Estilo / portal</label>';
    html += '<select id="hubNewsTheme"><option value="">General</option>';
    html += '<option value="despacho">Despacho (ámbar)</option>';
    html += '<option value="ops">Operaciones (verde)</option>';
    html += '<option value="mando">Mando (azul)</option>';
    html += '<option value="inventario">Inventario (dorado)</option></select>';
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
      html += '<th>Título</th><th>Portal</th><th>Fecha</th><th></th></tr></thead><tbody>';
      items.forEach(function (item) {
        html += '<tr><td>' + (item.pinned ? '📌 ' : '') + esc(item.title) + '</td>';
        html += '<td>' + esc(TAG_BY_THEME[item.theme] || 'General') + '</td>';
        html += '<td>' + esc(formatDate(item.publishedAt)) + '</td>';
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
    var imageEl = host.querySelector('#hubNewsImage');
    var linkEl = host.querySelector('#hubNewsLink');
    var themeEl = host.querySelector('#hubNewsTheme');
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
      if (imageEl) imageEl.value = '';
      if (linkEl) linkEl.value = '';
      if (themeEl) themeEl.value = '';
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
          imageUrl: imageEl ? imageEl.value : '',
          linkUrl: linkEl ? linkEl.value : '',
          theme: themeEl ? themeEl.value : '',
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

    if (cancelBtn) cancelBtn.addEventListener('click', resetForm);

    host.querySelectorAll('[data-edit-news]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-edit-news');
        var item = items.find(function (n) { return n.id === id; });
        if (!item) return;
        if (editId) editId.value = item.id;
        if (titleEl) titleEl.value = item.title;
        if (bodyEl) bodyEl.value = item.body || '';
        if (imageEl) imageEl.value = item.imageUrl || '';
        if (linkEl) linkEl.value = item.linkUrl || '';
        if (themeEl) themeEl.value = item.theme || '';
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
    renderAdminPanel: renderAdminPanel,
    stopCarousel: stopCarousel
  };
})(typeof window !== 'undefined' ? window : this);
