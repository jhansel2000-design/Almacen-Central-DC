'use strict';
/**
 * Servidor WMS — Red local (LAN)
 * - Escucha en 0.0.0.0 (todos los dispositivos del WiFi)
 * - Sirve archivos estáticos (HTML, CSS, JS)
 * - API REST para datos compartidos
 * - SSE (/api/events) para sincronización en tiempo real
 *
 * Uso: node server/lan-server.js
 *      node server/lan-server.js --port 8080
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { URL } = require('url');
const webUsersExport = require('../scripts/export-web-users.js');

const args = process.argv.slice(2);
function argValue(flag, fallback) {
  const i = args.indexOf(flag);
  if (i >= 0 && args[i + 1]) return args[i + 1];
  return fallback;
}

const PORT = parseInt(process.env.PORT || argValue('--port', '8080'), 10);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.svg': 'image/svg+xml',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

/** Nombres de almacén en disco ↔ claves localStorage del cliente */
const STORES = {
  operaciones: { file: 'operaciones.json', lsKey: 'almacen_platform_data_operaciones' },
  productividad: { file: 'productividad.json', lsKey: 'almacen_platform_data_productividad' },
  facturas: { file: 'facturas.json', lsKey: 'almacen_platform_data_facturas' },
  despacho: { file: 'despacho.json', lsKey: 'almacen_platform_data_despacho' },
  config: { file: 'config.json', lsKey: 'almacen_platform_config' },
  users: { file: 'users.json', lsKey: 'almacen_users' },
  areas: { file: 'areas.json', lsKey: 'almacen_areas' },
  logs: { file: 'logs.json', lsKey: 'almacen_logs' },
  accessRequests: { file: 'access-requests.json', lsKey: 'almacen_access_requests' }
};
let clientCounter = 0;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getLanAddresses() {
  const ips = [];
  const nets = os.networkInterfaces();
  Object.keys(nets).forEach(function (name) {
    (nets[name] || []).forEach(function (net) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push({ name: name, address: net.address });
      }
    });
  });
  return ips;
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    const chunks = [];
    req.on('data', function (c) { chunks.push(c); });
    req.on('end', function () {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(null);
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(new Error('JSON inválido')); }
    });
    req.on('error', reject);
  });
}

function storePath(name) {
  const meta = STORES[name];
  if (!meta) return null;
  return path.join(DATA_DIR, meta.file);
}

function readStore(name) {
  const fp = storePath(name);
  if (!fp || !fs.existsSync(fp)) return null;
  try {
    const stat = fs.statSync(fp);
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    return { data: data, mtime: stat.mtimeMs, size: stat.size };
  } catch (e) {
    return null;
  }
}

function writeStore(name, data) {
  ensureDataDir();
  const fp = storePath(name);
  if (!fp) throw new Error('Store desconocido: ' + name);
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(fp, json, 'utf8');
  if (name === 'users' && Array.isArray(data)) {
    try {
      webUsersExport.writeWebUsersFile(ROOT, data);
    } catch (e) {
      console.warn('[LAN] No se pudo exportar web-users.json:', e.message);
    }
  }
  const stat = fs.statSync(fp);
  return { mtime: stat.mtimeMs, size: stat.size };
}

function broadcast(event, payload) {
  const msg = 'event: ' + event + '\ndata: ' + JSON.stringify(payload) + '\n\n';
  sseClients.forEach(function (client) {
    try { client.res.write(msg); }
    catch (e) { sseClients.delete(client); }
  });
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, status, obj) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function sendText(res, status, text) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

function serveStatic(reqPath, res) {
  let urlPath = reqPath.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  const rel = urlPath.replace(/^\//, '').replace(/\//g, path.sep);
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    sendText(res, 404, 'Not found');
    return;
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
}

function handleApi(req, res, url) {
  cors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const p = url.pathname;

  if (req.method === 'GET' && p === '/api/health') {
    const ips = getLanAddresses();
    return sendJson(res, 200, {
      ok: true,
      service: 'wms-lan',
      version: 1,
      port: PORT,
      host: HOST,
      ips: ips,
      urls: ips.map(function (i) {
        return 'http://' + i.address + ':' + PORT;
      }),
      clients: sseClients.size,
      stores: Object.keys(STORES)
    });
  }

  if (req.method === 'GET' && p === '/api/data') {
    const out = {};
    Object.keys(STORES).forEach(function (name) {
      const row = readStore(name);
      out[name] = row ? { data: row.data, mtime: row.mtime, size: row.size } : null;
    });
    return sendJson(res, 200, { ok: true, stores: out });
  }

  if (req.method === 'GET' && p.startsWith('/api/data/')) {
    const name = p.slice('/api/data/'.length);
    if (!STORES[name]) return sendJson(res, 404, { ok: false, error: 'Store no encontrado' });
    const row = readStore(name);
    if (!row) return sendJson(res, 200, { ok: true, store: name, data: null, mtime: 0 });
    return sendJson(res, 200, {
      ok: true,
      store: name,
      lsKey: STORES[name].lsKey,
      data: row.data,
      mtime: row.mtime
    });
  }

  if (req.method === 'PUT' && p.startsWith('/api/data/')) {
    const name = p.slice('/api/data/'.length);
    if (!STORES[name]) return sendJson(res, 404, { ok: false, error: 'Store no encontrado' });
    return readBody(req).then(function (body) {
      if (!body || body.data === undefined) {
        return sendJson(res, 400, { ok: false, error: 'Falta campo data' });
      }
      const meta = writeStore(name, body.data);
      const payload = {
        store: name,
        lsKey: STORES[name].lsKey,
        mtime: meta.mtime,
        at: new Date().toISOString(),
        source: (body.source || 'client')
      };
      broadcast('update', payload);
      return sendJson(res, 200, { ok: true, store: name, mtime: meta.mtime });
    }).catch(function (e) {
      return sendJson(res, 400, { ok: false, error: e.message });
    });
  }

  if (req.method === 'POST' && p === '/api/publish-web-users') {
    const row = readStore('users');
    const users = row && row.data ? row.data : webUsersExport.readUsersFile(ROOT);
    const exported = webUsersExport.writeWebUsersFile(ROOT, users);
    return sendJson(res, 200, {
      ok: true,
      count: exported.payload.users.length,
      updatedAt: exported.payload.updatedAt,
      file: 'data/web-users.json'
    });
  }

  if (req.method === 'GET' && p === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(': connected\n\n');
    const client = { id: ++clientCounter, res: res };
    sseClients.add(client);
    const ping = setInterval(function () {
      try { res.write(': ping\n\n'); }
      catch (e) { clearInterval(ping); sseClients.delete(client); }
    }, 25000);
    req.on('close', function () {
      clearInterval(ping);
      sseClients.delete(client);
    });
    return;
  }

  if (req.method === 'GET' && p === '/api/info') {
    const ips = getLanAddresses();
    return sendJson(res, 200, {
      ok: true,
      hostname: os.hostname(),
      port: PORT,
      lan: ips,
      dataDir: DATA_DIR,
      instructions: {
        wms: ips.length ? 'http://' + ips[0].address + ':' + PORT + '/index.html' : null,
        despacho: ips.length ? 'http://' + ips[0].address + ':' + PORT + '/despacho.html' : null
      }
    });
  }

  sendJson(res, 404, { ok: false, error: 'Ruta API no encontrada' });
}

const server = http.createServer(function (req, res) {
  const url = new URL(req.url || '/', 'http://' + (req.headers.host || 'localhost'));
  if (url.pathname.startsWith('/api/')) {
    const result = handleApi(req, res, url);
    if (result && typeof result.then === 'function') {
      result.catch(function (e) {
        sendJson(res, 500, { ok: false, error: e.message });
      });
    }
    return;
  }
  serveStatic(url.pathname, res);
});

ensureDataDir();

server.listen(PORT, HOST, function () {
  const ips = getLanAddresses();
  console.log('');
  console.log('========================================');
  console.log('  Almacén Central DC — Servidor LAN');
  console.log('========================================');
  console.log('Escuchando en: ' + HOST + ':' + PORT);
  console.log('');
  console.log('En ESTE equipo:');
  console.log('  WMS:      http://localhost:' + PORT + '/index.html');
  console.log('  Despacho: http://localhost:' + PORT + '/despacho.html');
  console.log('');
  if (ips.length) {
    console.log('Desde OTROS dispositivos (mismo WiFi):');
    ips.forEach(function (net) {
      console.log('  [' + net.name + '] http://' + net.address + ':' + PORT + '/index.html');
      console.log('           http://' + net.address + ':' + PORT + '/despacho.html');
    });
  } else {
    console.log('No se detectó IP LAN. Revisa la conexión WiFi.');
  }
  console.log('');
  console.log('Datos compartidos en: ' + DATA_DIR);
  console.log('API salud: http://localhost:' + PORT + '/api/health');
  console.log('Tiempo real: SSE /api/events');
  console.log('Detener: Ctrl+C');
  console.log('========================================');
  console.log('');
});
