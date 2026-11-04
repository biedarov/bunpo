// Локальный просмотр: node src/serve.mjs → http://localhost:4173
import http from 'node:http';
import fs from 'node:fs';
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(fs.readFileSync(root + 'bunpo-local.html'));
}).listen(4173, () => console.log('http://localhost:4173'));
