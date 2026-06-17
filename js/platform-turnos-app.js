/**
 * Portal Control de Turnos — arranque
 */
(function (global) {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    if (global.PlatformTurnosUI && global.PlatformTurnosUI.start) {
      global.PlatformTurnosUI.start();
    }
  });

  window.addEventListener('beforeunload', function () {
    if (global.PlatformTurnosUI && global.PlatformTurnosUI.stopScanner) {
      global.PlatformTurnosUI.stopScanner();
    }
  });
})(typeof window !== 'undefined' ? window : this);
