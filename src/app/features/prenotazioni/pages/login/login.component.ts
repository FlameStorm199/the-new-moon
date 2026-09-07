import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';
import { BackLinkComponent } from '../../components/back-link/back-link.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, BackLinkComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  /**
   * Impostata solo quando l'errore è "email non ancora confermata": mostra
   * il bottone per rimandarla, con l'indirizzo su cui rimandarla. Per
   * qualunque altro errore (password sbagliata, utente inesistente) resta
   * null — il messaggio generico basta e non deve suggerire un reinvio che
   * non risolverebbe nulla.
   */
  readonly unconfirmedEmail = signal<string | null>(null);
  readonly resendState = signal<'idle' | 'sending' | 'sent'>('idle');

  async submit(): Promise<void> {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);
    this.unconfirmedEmail.set(null);
    this.resendState.set('idle');
    const { email, password } = this.form.getRawValue();
    const { error } = await this.auth.signIn(email, password);
    this.loading.set(false);

    if (error) {
      // .code è più affidabile di .message per distinguere i casi (vedi
      // AuthApiError in @supabase/auth-js): non tradotto da nessuna parte,
      // quindi controllato qui e non mostrato mai direttamente.
      if ((error as { code?: string }).code === 'email_not_confirmed') {
        this.errorMessage.set('Devi prima confermare la tua email: controlla la posta.');
        this.unconfirmedEmail.set(email);
      } else {
        this.errorMessage.set('Email o password non corretti.');
      }
      return;
    }

    this.router.navigateByUrl('/prenotazioni/area-personale');
  }

  async resendConfirmation(): Promise<void> {
    const email = this.unconfirmedEmail();
    if (!email || this.resendState() === 'sending') {
      return;
    }
    this.resendState.set('sending');
    try {
      await this.auth.resendSignupConfirmation(email);
      this.resendState.set('sent');
    } catch {
      this.resendState.set('idle');
      this.errorMessage.set('Invio non riuscito. Riprova tra qualche minuto.');
    }
  }
}
