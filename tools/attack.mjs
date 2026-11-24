import http from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';

// Visitors ask the proxy (SITE, default http://localhost:8080) for the site with `Host: example.test`.
// The attack is one GET / with the headers given as arguments, and it waits for the answer.
// While it waits, one visitor per second, for WATCH seconds (default 60).
//
//   node tools/attack.mjs "Host: example.test:4000"
//   node tools/attack.mjs "X-Forwarded-Host: example.test:4000" "X-Forwarded-Proto: https"
//   WATCH=90 node tools/attack.mjs "Host: localhost:4000"
const site = new URL(process.env.SITE ?? 'http://localhost:8080');
const attack = process.argv.length > 2 ? process.argv.slice(2) : ['Host: example.test:4000'];
const attackHeaders = Object.fromEntries(
  attack.map((header) => {
    const [name, value] = header.split(/:\s*(.+)/);
    return [name.toLowerCase(), value];
  }),
);
const watch = Number(process.env.WATCH ?? 60) * 1000;

function get(path, headers = {}, timeout = 5000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const options = {
      host: site.hostname,
      port: site.port,
      path,
      timeout,
      headers: { host: 'example.test', ...headers },
    };
    const req = http.get(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        const title = body.match(/site: ([\w-]+)/)?.[1] ?? '-';
        resolve({ status: res.statusCode, title, ms: Date.now() - start });
      });
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error(), { code: 'timeout' })));
    req.on('error', (error) =>
      resolve({ error: error.code ?? error.message, ms: Date.now() - start }),
    );
  });
}

const show = (r) => (r.error ? r.error : `${r.status}, site: ${r.title}, ${r.ms} ms`);
const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;

console.log(`visitor   GET /              ${show(await get('/'))}`);
console.log(`visitor   GET /no/such/page  ${show(await get('/no/such/page'))}`);
console.log(`attack    GET / with ${attack.join(', ')}`);

const t0 = Date.now();
let answer;
get('/', attackHeaders, watch + 10_000).then((r) => (answer = { ...r, at: Date.now() - t0 }));

const answered = [];
let failure;
while (Date.now() - t0 < watch && !failure) {
  await sleep(1000 - ((Date.now() - t0) % 1000));
  const r = await get('/');
  if (r.status === 200 && r.title !== '-' && r.title !== 'fallback') {
    answered.push(r.ms);
  } else {
    failure = { ...r, at: Date.now() - t0 };
  }
}

answered.sort((a, b) => a - b);
const median = answered[Math.floor(answered.length / 2)] ?? '-';
console.log(
  `visitors  ${answered.length} answered (median ${median} ms, max ${answered.at(-1) ?? '-'} ms)` +
    (failure
      ? `, then ${show(failure)} at ${seconds(failure.at)}`
      : `, none failed in ${seconds(watch)}`),
);
await sleep(500);
console.log(
  `attack    ${answer ? `${show(answer)} after ${seconds(answer.at)}` : `no answer after ${seconds(Date.now() - t0)}`}`,
);
console.log(`visitor   GET /              ${show(await get('/'))}`);
process.exit(0);
