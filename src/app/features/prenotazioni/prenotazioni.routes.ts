import { Routes } from '@angular/router';
import { authGuard } from '../../core/auth/auth.guard';

export const PRENOTAZIONI_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'registrati',
    loadComponent: () =>
      import('./pages/register/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: 'area-personale',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/area-personale/area-personale.component').then(
        (m) => m.AreaPersonaleComponent
      ),
  },
];
