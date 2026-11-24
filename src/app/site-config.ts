import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SiteConfig {
  private readonly http = inject(HttpClient);

  get() {
    return this.http.get<{ title: string }>('/api/config');
  }
}
