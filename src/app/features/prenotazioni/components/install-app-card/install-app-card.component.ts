import { Component, computed, inject, signal } from '@angular/core';
import { PwaService } from '../../../../core/pwa/pwa.service';

const DISMISS_KEY = 'pwa-install-dismissed-at';
/** "Non ora" non è "mai": dopo un mese il riquadro torna. */
const DISMISS_DAYS = 30;

/**
 * Invito ad aggiungere l'area prenotazioni alla schermata Home (PWA).
 *
 * Solo da telefono/tablet e solo se non la si sta già usando da app. Tre
 * varianti, perché i browser non si comportano allo stesso modo:
 * - Chrome/Android (e Chromium in genere): bottone "Installa" col prompt
 *   nativo, vedi PwaService.promptInstall();
 * - iPhone/iPad: nessun prompt esiste, solo i passaggi a mano da Condividi;
 * - Android senza prompt (Samsung Internet, Firefox, o prompt già usato):
 *   i passaggi dal menu del browser.
 *
 * Vive solo nell'area personale: il sito pubblico non deve mai rimandare
 * all'area riservata.
 */
@Component({
  selector: 'app-install-app-card',
  standalone: true,
  templateUrl: './install-app-card.component.html',
  styleUrl: './install-app-card.component.scss',
})
export class InstallAppCardComponent {
  readonly pwa = inject(PwaService);

  private readonly dismissed = signal(readDismissed());
  readonly installing = signal(false);

  readonly visible = computed(
    () => !this.pwa.standalone() && this.pwa.platform !== 'other' && !this.dismissed()
  );

  async install(): Promise<void> {
    this.installing.set(true);
    try {
      if (await this.pwa.promptInstall()) {
        this.dismissed.set(true);
      }
    } finally {
      this.installing.set(false);
    }
  }

  dismiss(): void {
    this.dismissed.set(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Storage bloccato (navigazione privata): si nasconde solo per ora.
    }
  }
}

function readDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return at > 0 && Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}
