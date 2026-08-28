import { Routes } from '@angular/router';
import { authGuard } from '../../core/auth/auth.guard';
import { staffGuard } from '../../core/auth/staff.guard';

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
  {
    path: 'utenti-da-validare',
    canActivate: [staffGuard],
    loadComponent: () =>
      import('./pages/utenti-da-validare/utenti-da-validare.component').then(
        (m) => m.UtentiDaValidareComponent
      ),
  },
  {
    path: 'gestione-slot',
    canActivate: [staffGuard],
    loadComponent: () =>
      import('./pages/gestione-slot/gestione-slot.component').then(
        (m) => m.GestioneSlotComponent
      ),
  },
  {
    path: 'prenota',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/prenota/prenota.component').then((m) => m.PrenotaComponent),
  },
];
