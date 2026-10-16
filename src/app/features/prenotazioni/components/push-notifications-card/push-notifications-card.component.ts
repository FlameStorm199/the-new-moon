import { Component, Input, inject, signal } from '@angular/core';
import { PushNotificationsService } from '../../../../core/pwa/push-notifications.service';

/**
 * Attiva/disattiva le notifiche push su questo dispositivo. Non compare dove
 * le push non esistono (iPhone fuori dall'app installata, browser vecchi,
 * `ng serve`): lì non c'è niente che l'utente possa fare da qui.
 *
 * Il testo cambia tra cliente e staff perché cambia cosa arriva: le push
 * seguono le stesse regole delle email (vedi supabase/functions/_shared/push.ts).
 */
@Component({
  selector: 'app-push-notifications-card',
  standalone: true,
  templateUrl: './push-notifications-card.component.html',
  styleUrl: './push-notifications-card.component.scss',
})
export class PushNotificationsCardComponent {
  readonly push = inject(PushNotificationsService);

  /**
   * Chi riceve cosa (stesse regole delle email): l'educatore tutte le
   * lezioni e i nuovi utenti, l'amministratore solo i nuovi utenti, il
   * cliente (e l'assistente, per le proprie lezioni) i propri appuntamenti.
   */
  @Input() audience: 'customer' | 'trainer' | 'admin' = 'customer';

  readonly errorMessage = signal<string | null>(null);

  async enable(): Promise<void> {
    this.errorMessage.set(null);
    try {
      await this.push.enable();
    } catch {
      this.errorMessage.set('Non siamo riusciti ad attivare le notifiche. Riprova tra poco.');
    }
  }

  async disable(): Promise<void> {
    this.errorMessage.set(null);
    try {
      await this.push.disable();
    } catch {
      this.errorMessage.set('Non siamo riusciti a disattivare le notifiche. Riprova tra poco.');
    }
  }
}
