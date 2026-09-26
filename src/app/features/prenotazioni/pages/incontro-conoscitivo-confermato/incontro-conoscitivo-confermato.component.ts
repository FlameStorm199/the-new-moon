import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IncontroConoscitivoService } from '../../../../core/users/incontro-conoscitivo.service';

type ConfirmState = 'checking' | 'confirmed' | 'invalid' | 'error';

/**
 * Atterraggio del link di conferma dell'Incontro Conoscitivo. Il link porta
 * un token legato alla prenotazione (?token=...): questa pagina lo consuma
 * con confirm_incontro_email e da quel momento la richiesta è "effettiva"
 * (notifica a cliente ed educatore). Vedi
 * database/37_fix_users_update_rules_and_incontro_token.sql per il perché
 * del token al posto della conferma email di GoTrue.
 *
 * Nessun guard e nessuna sessione richiesta: il link può essere aperto su un
 * dispositivo diverso da quello della prenotazione.
 */
@Component({
  selector: 'app-incontro-conoscitivo-confermato',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './incontro-conoscitivo-confermato.component.html',
  styleUrl: './incontro-conoscitivo-confermato.component.scss',
})
export class IncontroConoscitivoConfermatoComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly incontroConoscitivo = inject(IncontroConoscitivoService);

  readonly state = signal<ConfirmState>('checking');

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.state.set('invalid');
      return;
    }
    try {
      this.state.set((await this.incontroConoscitivo.confirmEmail(token)) ? 'confirmed' : 'invalid');
    } catch {
      this.state.set('error');
    }
  }
}
