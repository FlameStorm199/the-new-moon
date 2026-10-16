import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from './components/navbar/navbar.component';
import { FooterComponent } from './components/footer/footer.component';
import { CookieBannerComponent } from './components/cookie-banner/cookie-banner.component';
import { PwaService } from './core/pwa/pwa.service';
import { PushPromptComponent } from './components/push-prompt/push-prompt.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent, FooterComponent, CookieBannerComponent, PushPromptComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'asd-cinofila';

  // Istanziato qui e non al primo uso: deve gestire il manifest e catturare
  // il prompt di installazione fin dall'avvio, vedi PwaService.
  private readonly pwa = inject(PwaService);
}