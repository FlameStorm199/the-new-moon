import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';

/**
 * Atterraggio del link di conferma email dell'Incontro Conoscitivo (vedi
 * supabase/functions/_shared/email-confirmation.ts). Stesso motivo di
 * reimposta-password.component.ts: NESSUN authGuard qui — Supabase rimanda
 * con i token nel frammento dell'URL, supabase-js li legge da solo
 * all'avvio, e un guard sulla route rimbalzerebbe l'utente al login prima
 * ancora che quei token vengano letti.
 *
 * A differenza di reimposta-password non c'è nulla da impostare qui (niente
 * password per un future_customer, arriverà solo con "Trasforma in
 * assistito" più avanti, deciso dallo staff): la pagina si limita a
 * confermare l'esito.
 *
 * Revisione del flusso: quando si arriva qui, l'Incontro Conoscitivo è già
 * stato prenotato (pagina /prenotazioni/prenota-incontro-conoscitivo,
 * raggiunta subito dopo la creazione account — non più dopo questa
 * conferma). Questo click è quello che fa scattare la notifica "come di
 * consueto" a cliente ed educatore (vedi trg_lessons_notify_fn,
 * database/35_fase2_incontro_deferred_notification.sql): non c'è più nulla
 * da prenotare qui, solo da confermare che la richiesta è ora effettiva.
 */
@Component({
  selector: 'app-incontro-conoscitivo-confermato',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './incontro-conoscitivo-confermato.component.html',
  styleUrl: './incontro-conoscitivo-confermato.component.scss',
})
export class IncontroConoscitivoConfermatoComponent implements OnInit {
  private readonly auth = inject(AuthService);

  readonly checkingSession = signal(true);
  readonly confirmed = signal(false);

  async ngOnInit(): Promise<void> {
    this.confirmed.set(await this.auth.hasSession());
    this.checkingSession.set(false);
  }
}
