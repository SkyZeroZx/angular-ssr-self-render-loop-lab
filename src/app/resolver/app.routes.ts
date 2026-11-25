import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { Home } from '../home';
import { NotFound } from '../not-found';
import { Layout } from './layout';

export const routes: Routes = [
  {
    path: '',
    component: Layout,
    // The layout around every page needs the site's settings before it renders.
    resolve: { site: () => inject(HttpClient).get<{ title: string }>('/api/config') },
    children: [
      { path: '', component: Home },
      { path: '**', component: NotFound },
    ],
  },
];
