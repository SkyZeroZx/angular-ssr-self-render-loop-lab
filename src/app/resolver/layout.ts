import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-layout',
  imports: [RouterOutlet],
  template: `<header>site: {{ site.title }}</header>
    <router-outlet />`,
})
export class Layout {
  protected readonly site: { title: string } = inject(ActivatedRoute).snapshot.data['site'];
}
