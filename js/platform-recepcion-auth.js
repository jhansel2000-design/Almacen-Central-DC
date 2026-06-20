/**
 * Autenticación — Control Patio · Recepción de contenedores
 * Solo usuarios registrados en Administración / web-users.json
 */
(function (global) {
  'use strict';

  var ROLE_LABELS = {
    registrador: 'Registro patio',
    validador: 'Validación y entrada'
  };

  function getDisplayName(user) {
    if (!user) return '';
    return String(user.name || user.username || '').trim();
  }

  function getRoleLabel(user) {
    if (!user) return '';
    return ROLE_LABELS[user.role] || user.role;
  }

  function mapWmsToRecepcionRole(wmsUser, preferredArea) {
    if (!global.PlatformAdmin) return null;
    var canUse = global.PlatformAdmin.can(wmsUser.role, 'recepcion.use', wmsUser);
    var canVal = global.PlatformAdmin.can(wmsUser.role, 'recepcion.validate', wmsUser);
    if (!canUse && !canVal) return null;
    if (preferredArea === 'validador') {
      if (!canVal) return null;
      return 'validador';
    }
    if (!canUse) return null;
    return 'registrador';
  }

  function sessionFromWmsUser(wmsUser, preferredArea) {
    var role = mapWmsToRecepcionRole(wmsUser, preferredArea);
    if (!role) return null;
    return {
      id: wmsUser.id,
      username: wmsUser.username,
      name: getDisplayName(wmsUser),
      role: role,
      registeredRole: wmsUser.role,
      isPrimaryAdmin: wmsUser.isPrimaryAdmin
    };
  }

  function authenticate(username, passwordHash, preferredArea) {
    if (!global.PlatformAdmin) return null;
    preferredArea = preferredArea === 'validador' ? 'validador' : 'registrador';
    var wmsUser = global.PlatformAdmin.authenticate(username, passwordHash);
    if (!wmsUser) return null;
    return sessionFromWmsUser(wmsUser, preferredArea);
  }

  function canValidate(user) {
    return user && user.role === 'validador';
  }

  function canRegister(user) {
    return user && user.role === 'registrador';
  }

  global.PlatformRecepcionAuth = {
    ROLE_LABELS: ROLE_LABELS,
    authenticate: authenticate,
    getDisplayName: getDisplayName,
    getRoleLabel: getRoleLabel,
    canValidate: canValidate,
    canRegister: canRegister
  };
})(typeof window !== 'undefined' ? window : this);
