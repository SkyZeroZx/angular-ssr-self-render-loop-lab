# One image per case. compose.yml builds the target named by CASE.
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

# httpResource in the root component (src/app/http-resource/)
FROM app AS http-resource
RUN echo "export { App } from './http-resource/app';" > src/app/app.ts && npx ng build

# A resolver on the layout route around every page (src/app/resolver/)
FROM app AS resolver
RUN echo "export { App } from './resolver/app';" > src/app/app.ts \
  && echo "export { routes } from './resolver/app.routes';" > src/app/app.routes.ts \
  && npx ng build

# `ng new --ssr` of each Angular version with the same changes and the same root component
# and service, whose APIs are the same in all three (tools/scaffold.sh)
FROM node:24-slim AS scaffold

WORKDIR /lab

COPY api.mjs tools/scaffold.sh ./
COPY src/app/app.ts src/app/app.html src/app/site-config.ts src/app/app.routes.ts src/app/home.ts src/app/not-found.ts files/
CMD ["sh", "-c", "node api.mjs & exec node app/dist/ng-render-recursion/server/server.mjs"]

FROM scaffold AS angular-20
RUN sh scaffold.sh 20.3.43

FROM scaffold AS angular-21
RUN sh scaffold.sh 21.2.31

FROM scaffold AS angular-22
RUN sh scaffold.sh 22.3.0

# nginx as the distro packages it, with the site next to the distro's default site (site.conf)
FROM ${DISTRO}:${RELEASE} AS nginx
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends nginx \
  && rm -rf /var/lib/apt/lists/*
COPY docker/site.conf /etc/nginx/sites-enabled/site
CMD ["nginx", "-g", "daemon off;"]
