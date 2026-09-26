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
    // Nessun guard e non in navbar: raggiungibile solo da link diretto (dalla
    // pagina di registrazione e dall'area personale). Chiunque deve poterla
    // aprire, anche senza account.
    path: 'privacy',
    loadComponent: () =>
      import('./pages/privacy/privacy.component').then((m) => m.PrivacyComponent),
  },
  {
    // Atterraggio del link di conferma dell'Incontro Conoscitivo (Fase 2):
    // nessun guard, il link porta un token e può essere aperto senza
    // sessione, anche da un altro dispositivo — vedi
    // incontro-conoscitivo-confermato.component.ts.
    path: 'incontro-conoscitivo-confermato',
    loadComponent: () =>
      import(
        './pages/incontro-conoscitivo-confermato/incontro-conoscitivo-confermato.component'
      ).then((m) => m.IncontroConoscitivoConfermatoComponent),
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
    // Fase 2 — gestione eventi lato staff (assistente in sola lettura,
    // stesso principio di gestione-lezioni: le RPC respingono comunque chi
    // non è trainer/admin, staffGuard qui è solo per l'accesso alla pagina).
    path: 'gestione-eventi',
    canActivate: [staffGuard],
    loadComponent: () =>
      import('./pages/gestione-eventi/gestione-eventi.component').then(
        (m) => m.GestioneEventiComponent
      ),
  },
  {
    path: 'prenota',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/prenota/prenota.component').then((m) => m.PrenotaComponent),
  },
  {
    // Fase 2 — atterraggio subito dopo request-incontro-conoscitivo (login
    // automatico incluso nella risposta di quella Edge Function, vedi
    // incontro-conoscitivo.component.ts): authGuard basta, la sessione a
    // quel punto esiste già. Il componente stesso rimanda altrove chi non è
    // future_customer (vedi prenota-incontro-conoscitivo.component.ts).
    path: 'prenota-incontro-conoscitivo',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/prenota-incontro-conoscitivo/prenota-incontro-conoscitivo.component').then(
        (m) => m.PrenotaIncontroConoscitivoComponent
      ),
  },
  {
    // Fase 2 — riepilogo dopo la prenotazione dell'Incontro Conoscitivo (al
    // posto della ricevuta nel modale): vedi
    // incontro-conoscitivo-richiesta-inviata.component.ts.
    path: 'incontro-conoscitivo-richiesta-inviata',
    canActivate: [authGuard],
    loadComponent: () =>
      import(
        './pages/incontro-conoscitivo-richiesta-inviata/incontro-conoscitivo-richiesta-inviata.component'
      ).then((m) => m.IncontroConoscitivoRichiestaInviataComponent),
  },
  {
    path: 'le-mie-lezioni',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/le-mie-lezioni/le-mie-lezioni.component').then(
        (m) => m.LeMieLezioniComponent
      ),
  },
  {
    // Fase 2 — lista eventi + iscrizione/cancellazione self-service, stessi
    // diritti del Customer per assistant/future_customer (vedi
    // eventi.component.ts). Nessun gate di validazione: authGuard basta,
    // niente equivalente di canUsePlatform da controllare qui.
    path: 'eventi',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/eventi/eventi.component').then((m) => m.EventiComponent),
  },
];
