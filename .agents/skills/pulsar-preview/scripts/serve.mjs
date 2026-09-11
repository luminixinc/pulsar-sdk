#!/usr/bin/env node
/**
 * serve.mjs — zero-dependency static file server for previewing .pulsarapps.
 * ES-module apps do not load from file:// URLs, so previews need HTTP.
 *
 * CLI:    node serve.mjs <dir> [port]     (port 0 = auto; prints the URL)
 * Module: import { startServer } from './serve.mjs'
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.gif': 'image/gif', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

export function startServer(root, port = 0) {
  const base = resolve(root);
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
      if (path === '' || path.endsWith('/')) path += 'index.html';
      const file = join(base, path);
      if (!file.startsWith(base + sep)) { res.writeHead(403); res.end('forbidden'); return; }
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404); res.end('not found');
    }
  });
  return new Promise((resolvePromise) => {
    server.listen(port, '127.0.0.1', () => resolvePromise({ server, port: server.address().port }));
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [dir = '.', port = '0'] = process.argv.slice(2);
  const { port: p } = await startServer(dir, Number(port));
  console.log(`serving ${resolve(dir)} at http://localhost:${p}/`);
}
