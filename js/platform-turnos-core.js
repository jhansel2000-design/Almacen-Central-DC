/**
 * Control de Turnos — almacenamiento y lógica
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'dc_turnos_despacho_v1';
  var DEDUP_MS = 10000;

  function todayKey(d) {
    d = d || new Date();
    return d.toISOString().slice(0, 10);
  }

  function formatTime(d) {
    d = d || new Date();
    return d.toTimeString().slice(0, 8);
  }

  function formatTurno(n) {
    return 'T-' + String(Math.max(0, n)).padStart(4, '0');
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { counter: 0, entries: [] };
      var p = JSON.parse(raw);
      return {
        counter: Number(p.counter) || 0,
        entries: Array.isArray(p.entries) ? p.entries : []
      };
    } catch (e) {
      return { counter: 0, entries: [] };
    }
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function createEntry(counter, qrContent) {
    var now = new Date();
    return {
      id: String(now.getTime()) + '-' + Math.random().toString(36).slice(2, 7),
      turno: formatTurno(counter),
      fecha: todayKey(now),
      hora: formatTime(now),
      qrContent: String(qrContent || '').trim(),
      estado: 'PENDIENTE',
      createdAt: now.getTime()
    };
  }

  function isDuplicate(entries, qrContent) {
    var text = String(qrContent || '').trim();
    var cutoff = Date.now() - DEDUP_MS;
    return entries.some(function (e) {
      return e.qrContent === text && e.createdAt >= cutoff;
    });
  }

  function statsToday(entries) {
    var day = todayKey();
    var today = entries.filter(function (e) { return e.fecha === day; });
    return {
      totalHoy: today.length,
      validados: today.filter(function (e) { return e.estado === 'VALIDADO'; }).length,
      pendientes: today.filter(function (e) { return e.estado === 'PENDIENTE'; }).length
    };
  }

  function playBeep() {
    try {
      var ctx = new (global.AudioContext || global.webkitAudioContext)();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      osc.stop(ctx.currentTime + 0.26);
      setTimeout(function () { ctx.close(); }, 400);
    } catch (e) { /* noop */ }
  }

  global.PlatformTurnosCore = {
    STORAGE_KEY: STORAGE_KEY,
    loadState: loadState,
    saveState: saveState,
    createEntry: createEntry,
    isDuplicate: isDuplicate,
    statsToday: statsToday,
    formatTurno: formatTurno,
    playBeep: playBeep,
    todayKey: todayKey
  };
})(typeof window !== 'undefined' ? window : this);
