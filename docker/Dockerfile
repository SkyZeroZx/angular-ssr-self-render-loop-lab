# The site's image and the distro's nginx. compose.yml builds both.
ARG DISTRO=ubuntu
ARG RELEASE=24.04

FROM node:24-slim AS app

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
CMD ["sh", "-c", "node api.mjs & exec node dist/ng-render-recursion/server/server.mjs"]

# HttpClient in a service (src/app/site-config.ts)
FROM app AS http-client
RUN npx ng build

# nginx as the distro packages it, with the site next to the distro's default site (site.conf)
FROM ${DISTRO}:${RELEASE} AS nginx
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends nginx \
  && rm -rf /var/lib/apt/lists/*
COPY docker/site.conf /etc/nginx/sites-enabled/site
CMD ["nginx", "-g", "daemon off;"]
