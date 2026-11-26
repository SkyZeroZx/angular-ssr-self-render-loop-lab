#!/bin/sh
# k3s in Docker with the site of docker/k8s.yml behind ingress-nginx or behind the Traefik that k3s ships.
# Needs the http-client image (docker compose build site). The ingress answers on http://localhost:8090.
#   sh tools/k8s.sh ingress-nginx      (or traefik)
#   SITE=http://localhost:8090 node tools/attack.mjs "Host: localhost:4000"
#   docker rm -fv k3s
set -e
cd "$(dirname "$0")/.."
ingress=${1:-ingress-nginx}
k() { docker exec -i k3s kubectl "$@"; }

flags=--disable=metrics-server
[ "$ingress" = ingress-nginx ] && flags="$flags --disable=traefik"
docker rm -fv k3s > /dev/null 2>&1 || true
docker run -d --name k3s --privileged -p 8090:80 rancher/k3s:v1.34.1-k3s1 server $flags > /dev/null
until k get nodes 2> /dev/null | grep -q ' Ready'; do sleep 2; done
docker save ng-render-recursion:http-client | docker exec -i k3s ctr -n k8s.io images import - > /dev/null

if [ "$ingress" = ingress-nginx ]; then
  k apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.15.1/deploy/static/provider/cloud/deploy.yaml > /dev/null
  k -n ingress-nginx wait --for=condition=complete job --all --timeout=300s > /dev/null
  k -n ingress-nginx rollout status deploy/ingress-nginx-controller --timeout=300s > /dev/null
  ip=$(k -n ingress-nginx get svc ingress-nginx-controller -o jsonpath='{.spec.clusterIP}')
  class=nginx
else
  until k -n kube-system get deploy traefik > /dev/null 2>&1; do sleep 2; done
  k -n kube-system rollout status deploy/traefik --timeout=300s > /dev/null
  ip=$(k -n kube-system get svc traefik -o jsonpath='{.spec.clusterIP}')
  class=traefik
fi

sed -e "s/INGRESS_IP/$ip/" -e "s/INGRESS_CLASS/$class/" docker/k8s.yml | k apply -f - > /dev/null
k rollout status deploy/site --timeout=300s > /dev/null
until curl -s -H 'Host: example.test' http://localhost:8090/ | grep -q 'site: from-api'; do sleep 2; done
echo "The site answers behind $ingress on http://localhost:8090"
