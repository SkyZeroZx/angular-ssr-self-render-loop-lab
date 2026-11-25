import { httpResource } from '@angular/common/http';
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<header>site: {{ site.hasValue() ? site.value().title : 'fallback' }}</header>
    <router-outlet />`,
})
export class App {
  protected readonly site = httpResource<{ title: string }>(() => '/api/config');
}
