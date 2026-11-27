// A local stand-in for the Khalti and eSewa APIs. Tests never call a real host.
const http = require('node:http');

/**
 * Start a server. `routes` maps "METHOD /path" to a handler that returns
 * { status, body } (body is JSON unless it is a string).
 */
async function startFake(routes) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', c => (raw += c));
    req.on('end', () => {
      const url = new URL(req.url, 'http://localhost');
      const key = `${req.method} ${url.pathname}`;
      calls.push({ key, headers: req.headers, body: raw, query: Object.fromEntries(url.searchParams) });
      const handler = routes[key];
      if (!handler) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ detail: 'Not found.' }));
        return;
      }
      const parsed = raw && req.headers['content-type']?.includes('json') ? JSON.parse(raw) : raw;
      const { status, body } = handler(parsed, url.searchParams);
      const isText = typeof body === 'string';
      res.writeHead(status, { 'content-type': isText ? 'text/html' : 'application/json' });
      res.end(isText ? body : JSON.stringify(body));
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, calls, close: () => new Promise(r => server.close(r)) };
}

module.exports = { startFake };
