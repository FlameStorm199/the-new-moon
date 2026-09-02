import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';

/**
 * Atterraggio del link "reimposta password" ricevuto via email.
 *
 * Supabase rimanda qui con i token nel frammento dell'URL; supabase-js li
 * legge da solo all'avvio (detectSessionInUrl, attivo di default) e stabilisce
 * una sessione di recupero. Quella sessione è la prova di identità che
 * permette di impostare la nuova password: se manca — link scaduto, già usato,
 * o pagina aperta a mano — non c'è nulla da fare se non richiedere una nuova
 * email.
 */
@Component({
  selector: 'app-reimposta-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './reimposta-password.component.html',
  styleUrl: './reimposta-password.component.scss',
})
export class ReimpostaPasswordComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = new FormGroup({
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8)],
    }),
    confirmPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  readonly checkingSession = signal(true);
  readonly hasRecoverySession = signal(false);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly done = signal(false);

  async ngOnInit(): Promise<void> {
    // getSession() attende l'inizializzazione del client, inclusa la lettura
    // dei token dal frammento dell'URL: a questo punto la sessione di
    // recupero, se il link era valido, esiste già.
    this.hasRecoverySession.set(await this.auth.hasSession());
    this.checkingSession.set(false);
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }
    const { password, confirmPassword } = this.form.getRawValue();
    if (password !== confirmPassword) {
      this.errorMessage.set('Le due password non coincidono.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      await this.auth.updatePassword(password);
      this.done.set(true);
      // La sessione di recupero resta valida: l'utente è già dentro, non ha
      // senso rimandarlo al login a riscrivere la password appena scelta.
      setTimeout(() => this.router.navigateByUrl('/prenotazioni/area-personale'), 2000);
    } catch (err) {
      const message = (err as { message?: string } | null)?.message;
      this.errorMessage.set(message || 'Non è stato possibile aggiornare la password.');
    } finally {
      this.loading.set(false);
    }
  }
}
