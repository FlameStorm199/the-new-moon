import { Component, computed, inject, signal } from '@angular/core';
import { PushNotificationsService } from '../../../core/pwa/push-notifications.service';

/**
 * Voce "Notifiche" del menu account: interruttore delle push su questo
 * dispositivo, con lo stato scritto sotto. Stesso servizio del riquadro in
 * area personale, quindi i due restano sempre allineati.
 *
 * A parte rispetto alla navbar solo per tenerne lo SCSS sotto il budget
 * per componente (angular.json); l'aspetto ricalca .account-item di
 * navbar.component.scss, che qui non arriva per l'incapsulamento degli stili.
 */
@Component({
  selector: 'app-push-menu-item',
  standalone: true,
  templateUrl: './push-menu-item.component.html',
  styleUrl: './push-menu-item.component.scss',
})
export class PushMenuItemComponent {
  readonly push = inject(PushNotificationsService);
  readonly errorMessage = signal<string | null>(null);

  /** Errore da mostrare sotto "Notifiche": il proprio, o l'ultima attivazione fallita (anche automatica). */
  readonly shownError = computed(
    () =>
      this.errorMessage() ??
      (this.push.state() === 'off' && !this.push.busy() ? this.push.lastError() : null)
  );

  /** Il click è il gesto che iOS richiede per mostrare la richiesta di permesso. */
  async toggle(): Promise<void> {
    this.errorMessage.set(null);
    const turningOn = this.push.state() === 'off';
    try {
      await (turningOn ? this.push.enable() : this.push.disable());
    } catch {
      // L'errore di attivazione (con il codice del passaggio fallito) lo
      // espone già il servizio in lastError, anche per l'attivazione
      // automatica al caricamento: qui resta solo quello di disattivazione.
      if (!turningOn) {
        this.errorMessage.set('Disattivazione non riuscita, riprova.');
      }
    }
  }
}
