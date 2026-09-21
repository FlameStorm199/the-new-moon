import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { AboutComponent } from './pages/about/about.component';
import { LocationsComponent } from './pages/locations/locations.component';
import { ActivitiesComponent } from './pages/activities/activities.component';
import { NewsComponent } from './pages/news/news.component';
import { DownloadComponent } from './pages/download/download.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'about', component: AboutComponent },
  { path: 'locations', component: LocationsComponent },
  { path: 'activities', component: ActivitiesComponent },
  { path: 'news', component: NewsComponent },
  { path: 'download', component: DownloadComponent },
  {
    path: 'prenotazioni',
    loadChildren: () =>
      import('./features/prenotazioni/prenotazioni.routes').then((m) => m.PRENOTAZIONI_ROUTES),
  },
  {
    // Fuori da /prenotazioni e fuori navbar (Fase 2, decisione del centro):
    // pubblica, raggiungibile solo da URL diretto. Vive comunque dentro la
    // feature prenotazioni (componenti/servizi condivisi), solo l'URL è
    // top-level come da handoff_fase2.md.
    path: 'incontro-conoscitivo',
    loadComponent: () =>
      import('./features/prenotazioni/pages/incontro-conoscitivo/incontro-conoscitivo.component').then(
        (m) => m.IncontroConoscitivoComponent
      ),
  },
  { path: '**', redirectTo: '' }
];