'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const { DatabaseSync } = require('node:sqlite');

const site = path.join(__dirname, 'site');
const database = new DatabaseSync(path.join(__dirname, 'archive.sqlite3'), { readOnly: true });
const metadata = database.prepare('SELECT body FROM catalog WHERE id = 1').get().body;
const fullImage = database.prepare('SELECT image AS bytes FROM photos WHERE id = ?');
const thumbnail = database.prepare('SELECT thumb AS bytes FROM photos WHERE id = ?');
const accessHash = Buffer.from(fs.readFileSync(path.join(__dirname, 'access.sha256'), 'utf8').trim(), 'hex');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8',
};
const blocked = '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Archivo del museo</title><body><main><h1>Matemática y Física</h1><p>Abre el enlace de acceso que te compartió el equipo del campus.</p></main></body></html>';

function send(req, res, status, body, contentType) {
  res.statusCode = status;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(req.method === 'HEAD' ? undefined : body);
}

function authorized(value) {
  if (!value || !/^[a-zA-Z0-9_-]{43}$/.test(value)) return false;
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(value).digest(), accessHash);
}

function rangeFor(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || !(match[1] || match[2])) return null;
  const [_, from, to] = match;
  const start = from ? Number(from) : Math.max(0, size - Number(to));
  const end = from && to ? Math.min(size - 1, Number(to)) : size - 1;
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start <= end ? { start, end } : null;
}

module.exports = async function museum(req, res) {
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  const reject = () => send(req, res, 404, 'No encontrado', 'text/plain; charset=utf-8');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return send(req, res, 405, 'Método no permitido', 'text/plain; charset=utf-8');
  }

  const url = new URL(req.url, 'http://localhost');
  const gate = /^\/visita\/([a-zA-Z0-9_-]{43})\/(.*)$/.exec(url.pathname);
  const key = gate?.[1] ?? url.searchParams.get('__entry');
  if (!authorized(key)) {
    if (url.pathname === '/' && !key) return send(req, res, 200, blocked, types['.html']);
    return reject();
  }

  const file = (gate?.[2] ?? url.searchParams.get('__file') ?? '') || 'index.html';
  if (file === 'aportes.js') return send(req, res, 200, metadata, types['.js']);
  const photo = /^aportes\/(wa-[a-f0-9]{64})(-mini)?\.webp$/.exec(file);
  if (photo) {
    const record = (photo[2] ? thumbnail : fullImage).get(photo[1]);
    if (!record) return reject();
    return send(req, res, 200, Buffer.from(record.bytes), types['.webp']);
  }
  if (!file.split('/').every(segment => /^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(segment))) return reject();

  const contentType = types[path.extname(file)];
  if (!contentType) return reject();
  const filename = path.join(site, file);
  let stat;
  try { stat = fs.statSync(filename); } catch { return reject(); }
  if (!stat.isFile()) return reject();

  let range;
  if (contentType === types['.mp4']) {
    res.setHeader('Accept-Ranges', 'bytes');
    if (req.headers.range) {
      range = rangeFor(req.headers.range, stat.size);
      if (!range) {
        res.setHeader('Content-Range', 'bytes */' + stat.size);
        return send(req, res, 416, '', contentType);
      }
      res.setHeader('Content-Range', 'bytes ' + range.start + '-' + range.end + '/' + stat.size);
    }
  }
  res.statusCode = range ? 206 : 200;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', range ? range.end - range.start + 1 : stat.size);
  if (req.method === 'HEAD') return res.end();
  await pipeline(fs.createReadStream(filename, range), res);
};
