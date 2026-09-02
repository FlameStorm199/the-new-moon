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
    path: 'password-dimenticata',
    loadComponent: () =>
      import('./pages/password-dimenticata/password-dimenticata.component').then(
        (m) => m.PasswordDimenticataComponent
      ),
  },
  {
    // Nessun guard: ci si arriva dal link ricevuto via email, e la sessione
    // di recupero viene stabilita dalla pagina stessa leggendo i token
    // dall'URL. Un authGuard qui rimbalzerebbe l'utente al login prima
    // ancora che quei token vengano letti.
    path: 'reimposta-password',
    loadComponent: () =>
      import('./pages/reimposta-password/reimposta-password.component').then(
        (m) => m.ReimpostaPasswordComponent
      ),
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
    path: 'fasce-orarie',
    canActivate: [staffGuard],
    loadComponent: () =>
      import('./pages/fasce-orarie/fasce-orarie.component').then(
        (m) => m.FasceOrarieComponent
      ),
  },
  {
    path: 'gestione-utenti',
    canActivate: [staffGuard],
    loadComponent: () =>
      import('./pages/gestione-utenti/gestione-utenti.component').then(
        (m) => m.GestioneUtentiComponent
      ),
  },
  {
    path: 'gestione-lezioni',
    canActivate: [staffGuard],
    loadComponent: () =>
      import('./pages/gestione-lezioni/gestione-lezioni.component').then(
        (m) => m.GestioneLezioniComponent
      ),
  },
  {
    path: 'prenota',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/prenota/prenota.component').then((m) => m.PrenotaComponent),
  },
  {
    path: 'le-mie-lezioni',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/le-mie-lezioni/le-mie-lezioni.component').then(
        (m) => m.LeMieLezioniComponent
      ),
  },
];
