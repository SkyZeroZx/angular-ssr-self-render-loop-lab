import { Routes } from '@angular/router';
import { Home } from './home';
import { NotFound } from './not-found';

export const routes: Routes = [
  { path: '', component: Home },
  { path: '**', component: NotFound },
];
