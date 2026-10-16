import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { PushNotificationsService } from '../../core/pwa/push-notifications.service';

const DISMISS_KEY = 'push-prompt-dismissed-at';
/** "Non ora" non è "mai": dopo due settimane l'invito torna. */
const DISMISS_DAYS = 14;
const APP_PREFIX = '/prenotazioni';

/**
 * Invito ad attivare le notifiche, in cima alle pagine dell'area
 * prenotazioni. È il "di default" possibile: il browser non permette di
 * attivarle senza un tocco dell'utente, quindi le si propone subito dopo
 * l'accesso, con un pulsante solo.
 *
 * Compare solo se il permesso non è mai stato chiesto su questo dispositivo
 * (PushNotificationsService.shouldAsk): se è già concesso si attivano da
 * sole, se è negato insistere non serve — lo stato resta visibile dal
 * badge sull'avatar e dalla voce "Notifiche" del menu account.
 */
@Component({
  selector: 'app-push-prompt',
  standalone: true,
  templateUrl: './push-prompt.component.html',
  styleUrl: './push-prompt.component.scss',
})
export class PushPromptComponent {
  private readonly router = inject(Router);
  readonly push = inject(PushNotificationsService);

  private readonly inApp = signal(isAppUrl(this.router.url));
  private readonly dismissed = signal(readDismissed());
  readonly errorMessage = signal<string | null>(null);

  readonly visible = computed(() => this.inApp() && !this.dismissed() && this.push.shouldAsk());

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe((e) => this.inApp.set(isAppUrl(e.urlAfterRedirects)));
  }

  async enable(): Promise<void> {
    this.errorMessage.set(null);
    try {
      await this.push.enable();
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Attivazione non riuscita, riprova.');
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

function isAppUrl(url: string): boolean {
  return url === APP_PREFIX || url.startsWith(`${APP_PREFIX}/`) || url.startsWith(`${APP_PREFIX}?`);
}

function readDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return at > 0 && Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}
