/**
 * Service Worker — notificaciones de convocatoria (mejor soporte iPhone / PWA)
 */
self.addEventListener('install', function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', function (event) {
  var data = event.data || {};
  if (data.type !== 'turnos-call') return;
  var title = data.title || '¡Ya es su turno!';
  var options = {
    body: data.body || 'Pase a la ventana indicada.',
    tag: data.tag || 'turnos-chofer-call',
    requireInteraction: true,
    icon: data.icon || 'assets/img/icon-turnos-gestion.svg',
    vibrate: [400, 150, 400, 150, 600],
    data: { url: data.url || './turnos.html' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || './turnos.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      var i;
      for (i = 0; i < list.length; i += 1) {
        if ('focus' in list[i]) {
          return list[i].focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    })
  );
});
