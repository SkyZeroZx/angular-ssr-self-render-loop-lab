# Angular SSR renders its own requests until it runs out of memory

One request with the SSR server's port in `Host` makes an Angular SSR server render itself until Node aborts with `JavaScript heap out of memory`, in about 15 seconds in a 1 GB container. The nginx in front is the one Ubuntu packages, with the `proxy_params` file it ships.

The app is `ng new --ssr` on Angular 22.3.0. Its root component shows the site's settings, which a service gets from the API ([site-config.ts](src/app/site-config.ts)):

```ts
@Injectable({ providedIn: 'root' })
export class SiteConfig {
  private readonly http = inject(HttpClient);

  get() {
    return this.http.get<{ title: string }>('/api/config');
  }
}
```

Every route renders on the server (`RenderMode.Server` on `**`), unknown paths get a not-found page, and `allowedHosts` only has `example.test`. nginx sends `/api/` to the API ([api.mjs](api.mjs)) and the rest to Node on port 4000 ([site.conf](docker/site.conf)).

## Why

During SSR a relative URL is resolved against the URL of the request being rendered, [port included](https://github.com/angular/angular/blob/v22.3.0/packages/platform-server/src/http.ts#L82-L93). The Node adapter [builds that URL](https://github.com/angular/angular-cli/blob/v22.3.0/packages/angular/ssr/node/src/request.ts#L116-L153) from `Host` as it arrived. `allowedHosts`, added in [#32516](https://github.com/angular/angular-cli/pull/32516), [checks the host name](https://github.com/angular/angular-cli/blob/v22.3.0/packages/angular/ssr/src/utils/validation.ts#L134-L154) and lets any port through. That's known: [#33128](https://github.com/angular/angular-cli/pull/33128) proposed checking the port and was closed with "Validation is handled by the user when using the `trustProxyHeaders` configuration". So `Host: example.test:4000` is accepted, and the service's `/api/config` goes to port 4000, the SSR server itself, instead of nginx.

The SSR server doesn't serve `/api/config` and the `**` route matches it, so the engine [renders it like any other page](https://github.com/angular/angular-cli/blob/v22.3.0/packages/angular/ssr/src/app.ts#L156-L198). That render runs the same root component, which sends the same request one level deeper. Nothing marks a request as coming from a render and nothing limits the depth, so every level keeps an application and two sockets open while it waits for the next one.

## Manual test

```sh
cd docker
docker compose up -d --build site nginx
node ../tools/attack.mjs "Host: example.test:4000"
```

```text
visitor   GET /              200, site: from-api, 42 ms
visitor   GET /no/such/page  200, site: from-api, 15 ms
attack    GET / with Host: example.test:4000
visitors  12 answered (median 17 ms, max 89 ms), then 502, site: -, 2258 ms at 15.3 s
attack    502, site: -, 15264 ms after 15.3 s
visitor   GET /              ECONNRESET
```

`docker compose ps -a site` shows `Exited (134)` and `docker compose logs site` ends with `FATAL ERROR: ... JavaScript heap out of memory`. `api.mjs` logs every request it gets, and the attack adds none. [tools/attack.mjs](tools/attack.mjs) sends two visitors, the request, then one visitor per second.

## Proxies

`allowedHosts` only has the site's name, as the [security guide](https://angular.dev/best-practices/security#preventing-server-side-request-forgery-ssrf) asks, and these proxies pass the port on to Node in `Host`:

| Proxy config | `Host` that reaches Node | 1 GB container | Default in |
| --- | --- | --- | --- |
| nginx, `Host $http_host` | `example.test:4000` | exits after 14.1 s on Ubuntu 22.04, 15.4 s on 24.04 | Ubuntu 22.04 and 24.04 `proxy_params`, [PM2's nginx guide](https://pm2.keymetrics.io/docs/tutorials/pm2-nginx-production-setup) |
| nginx, `Host $host$is_request_port$request_port` | `example.test:4000` | exits after 14.7 s on Ubuntu 26.04 | Ubuntu 26.04 and Debian testing `proxy_params` |
| Caddy, `reverse_proxy` | `example.test:4000` | exits after 14.2 s | Caddy ([Caddyfile](docker/Caddyfile)) |

The nginx rows use the distro's own nginx package with a site that only does `include proxy_params;`. nginx needs some `Host` line in front of Angular: without one it sends [the upstream's address](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header), `127.0.0.1:4000`, and Angular answers every request with 400.

```sh
RELEASE=26.04 docker compose up -d --build site nginx
docker compose up -d site caddy
```

In `compose.yml` the proxy shares the site's network and the container's hostname is `example.test`, so the name resolves to the machine that runs Node, as on a VPS. A new 22 project ignores `X-Forwarded-Proto`, so the URL stays `http://` behind HTTPS too.

## Proxy headers

On 20.3 and 21.2 Angular trusts `X-Forwarded-Host` and `X-Forwarded-Proto` unless `trustProxyHeaders` says otherwise ([validation.ts](https://github.com/angular/angular-cli/blob/v21.2.31/packages/angular/ssr/src/utils/validation.ts#L255-L257)). 22 trusts neither, and its migration adds both to every server file that creates `AngularNodeAppEngine` ([migration.ts](https://github.com/angular/angular-cli/blob/v22.3.0/packages/schematics/angular/migrations/trust-proxy-headers/migration.ts#L80-L83)). nginx passes `X-Forwarded-Host` on as the client sent it, so the port gets in with a `Host $host` line too, as in the [NGINX reverse proxy guide](https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/). On 22.3.0 with the migration's option, which the environment variable sets, the process exits after 14.6 s:

```sh
NG_TRUST_PROXY_HEADERS=x-forwarded-host,x-forwarded-proto NGINX_CONF=nginx-host.conf docker compose up -d site nginx-org
node ../tools/attack.mjs "X-Forwarded-Host: example.test:4000"
```

## `localhost` in the allow-list

`localhost` is the machine that runs Node wherever nginx is. nginx sends the unknown name to the site, because the site has the only server block ([nginx.conf](docker/nginx.conf)), and the process exits after 15.6 s, or after 15.8 s with nginx on another machine ([two-machines.yml](docker/two-machines.yml)). `*` in the allow-list does the same with any name: `Host: 127.0.0.1:4000` ends the process after 15.4 s.

```sh
NG_ALLOWED_HOSTS=localhost docker compose up -d site nginx-org
node ../tools/attack.mjs "Host: localhost:4000"
```

## How common

A GitHub code search on 2026-11-23 found 5,036 public nginx configs that proxy to `localhost:4000`. 217 of them pass the port on with `Host $http_host`, and only 106 set `X-Forwarded-Host` themselves. The rest pass on what the client sends. Code search counts files, so the numbers are approximate.

## Other places for the request

Each case is an image, with its code in a folder of `src/app`, for example `CASE=resolver docker compose up -d --build site nginx`:

| `CASE` | The relative request | `Host: example.test:4000` |
| --- | --- | --- |
| `http-client` | `HttpClient` in a service ([site-config.ts](src/app/site-config.ts)) | exits after 15.4 s |
| `http-resource` | `httpResource` in the root component ([http-resource](src/app/http-resource)) | exits after 14.7 s |
| `resolver` | a resolver on the layout route around every page ([resolver](src/app/resolver)) | exits after 12.5 s |

## Versions

| `CASE` | Angular | `Host: example.test:4000`, `nginx-org` | `X-Forwarded-Host: example.test:4000`, `nginx-org` with `nginx-host.conf` |
| --- | --- | --- | --- |
| `angular-22` | 22.3.0 | exits after 14.9 s | exits after 15.2 s with the migration's `trustProxyHeaders` |
| `angular-21` | 21.2.31 | exits after 14.3 s | exits after 14.9 s |
| `angular-20` | 20.3.43 | exits after 13.9 s | exits after 13.7 s |

Each image is `ng new --ssr` of that version with the same changes, root component and service ([scaffold.sh](tools/scaffold.sh)). On 20.3 and 21.2 the `X-Forwarded-Host` column needs no setting.

## Container size

Node picks its heap from the container's memory limit (`MEMORY=4g docker compose up ...`):

| Limit | Heap | The request of case 1 |
| --- | --- | --- |
| 1 GB | 560 MB | exits after 15.4 s, 686 MB RSS, 8,711 open descriptors |
| 4 GB | 2,240 MB | exits after 66.6 s, 2,346 MB RSS, 36,055 open descriptors |

Measured 2026-11-23 in Docker 29.7.2 on Windows 11, with Node 24.22.3 and `@angular/ssr` 20.3.43, 21.2.31 and 22.3.0 (Angular 20.3.35, 21.2.26 and 22.3.0). The proxies were nginx 1.18.0, 1.24.0 and 1.28.3 from Ubuntu 22.04, 24.04 and 26.04, 1.30.7 from nginx.org, and Caddy 2.11.9.
