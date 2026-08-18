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
  { path: '**', redirectTo: '' }
];