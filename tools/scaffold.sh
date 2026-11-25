#!/bin/sh
# Makes the lab's app in ./app with `ng new --ssr` of Angular $1 and builds it, with the same
# changes as src/: RenderMode.Server on "**", provideHttpClient(), the root component and its
# service, the two pages, and example.test in allowedHosts.
set -e
npx -y "@angular/cli@$1" new ng-render-recursion --directory app \
  --ssr --defaults --interactive=false --skip-git
cd app

sed -i 's/RenderMode.Prerender/RenderMode.Server/' src/app/app.routes.server.ts
sed -i "1i import { provideHttpClient } from '@angular/common/http';" src/app/app.config.ts
sed -i 's/provideRouter(routes),/provideRouter(routes), provideHttpClient(),/' src/app/app.config.ts
grep -q 'provideHttpClient()' src/app/app.config.ts
cp ../files/* src/app/

if grep -q allowedHosts node_modules/@angular/build/src/builders/application/schema.json; then
  node -e "
    const fs = require('node:fs');
    const config = JSON.parse(fs.readFileSync('angular.json', 'utf8'));
    const options = config.projects['ng-render-recursion'].architect.build.options;
    options.security = { ...options.security, allowedHosts: ['example.test'] };
    fs.writeFileSync('angular.json', JSON.stringify(config, null, 2));
  "
else
  echo "This version has no security.allowedHosts option."
fi

npx ng build
npx ng version | grep -E '^(Angular|@angular/(build|core|ssr))'
