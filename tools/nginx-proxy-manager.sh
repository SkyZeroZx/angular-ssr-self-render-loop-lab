#!/bin/sh
# Adds the site to Nginx Proxy Manager as a proxy host through its API, the way its UI does:
# example.test to 127.0.0.1:4000, with a custom location /api/ to 127.0.0.1:4400. Run it from docker/:
#   docker compose up -d site nginx-proxy-manager && sh ../tools/nginx-proxy-manager.sh
set -e
api() { docker compose exec -T nginx-proxy-manager curl -s "$@"; }

until api http://127.0.0.1:81/api/ 2>/dev/null | grep -q '"status":"OK"'; do sleep 1; done

token=$(api -X POST http://127.0.0.1:81/api/tokens -H 'content-type: application/json' \
  -d '{"identity":"lab@example.test","secret":"lab-password-123"}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')

api -X POST http://127.0.0.1:81/api/nginx/proxy-hosts -H "authorization: Bearer $token" \
  -H 'content-type: application/json' -d '{
    "domain_names": ["example.test"],
    "forward_scheme": "http", "forward_host": "127.0.0.1", "forward_port": 4000,
    "locations": [{ "path": "/api/", "advanced_config": "", "forward_scheme": "http", "forward_host": "127.0.0.1", "forward_port": 4400 }],
    "access_list_id": 0, "certificate_id": 0, "meta": {}, "advanced_config": "",
    "block_exploits": false, "caching_enabled": false, "allow_websocket_upgrade": false,
    "http2_support": false, "hsts_enabled": false, "hsts_subdomains": false, "ssl_forced": false
  }' > /dev/null

until curl -s -H 'Host: example.test' http://localhost:8080/ | grep -q 'site: from-api'; do sleep 1; done
echo "example.test is a proxy host of Nginx Proxy Manager"
