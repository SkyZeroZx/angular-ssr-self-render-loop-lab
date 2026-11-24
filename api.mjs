import { createServer } from 'node:http';

// The site's API. nginx sends /api/ here. Logs one line per request.
createServer((req, res) => {
  console.log(`api: ${req.method} ${req.url} host=${req.headers.host}`);
  if (req.url !== '/api/config') {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end('{"title":"from-api"}');
}).listen(4400, () => console.log('api on 4400'));
