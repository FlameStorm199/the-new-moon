import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';
import { BackLinkComponent } from '../../components/back-link/back-link.component';

const MIN_PASSWORD_LENGTH = 8;

const REQUIRED_MESSAGES = {
  name: 'Inserisci il nome.',
  surname: 'Inserisci il cognome.',
  email: "Inserisci l'email.",
  phone: 'Inserisci il telefono.',
  dogName: 'Inserisci il nome del cane.',
  password: 'Scegli una password.',
} as const;

type FieldName = keyof typeof REQUIRED_MESSAGES;

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, BackLinkComponent],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    surname: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    phone: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    dogName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH)],
    }),
  });

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly registered = signal(false);
  readonly resendState = signal<'idle' | 'sending' | 'sent'>('idle');

  readonly minPasswordLength = MIN_PASSWORD_LENGTH;
  readonly showPassword = signal(false);

  togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  /**
   * Messaggio sotto il campo, solo dopo che l'utente ci è passato (o ha
   * premuto "Registrati"): prima di questo, un form incompleto al click non
   * diceva nulla e il bottone sembrava semplicemente non funzionare.
   */
  fieldError(name: FieldName): string | null {
    const control = this.form.controls[name];
    if (!control.touched || control.valid) {
      return null;
    }
    if (control.hasError('required')) {
      return REQUIRED_MESSAGES[name];
    }
    if (control.hasError('email')) {
      return "L'indirizzo email non sembra valido.";
    }
    if (control.hasError('minlength')) {
      return `La password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri.`;
    }
    return null;
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);
    const value = this.form.getRawValue();

    const { data, error } = await this.auth.signUp({
      name: value.name,
      surname: value.surname,
      email: value.email,
      password: value.password,
      phone: value.phone,
      dogName: value.dogName,
    });

    this.loading.set(false);

    if (error) {
      this.errorMessage.set(
        error.message === 'User already registered'
          ? 'Esiste già un account con questa email.'
          : 'Registrazione non riuscita. Riprova.'
      );
      return;
    }

    if (data.session) {
      this.router.navigateByUrl('/prenotazioni/area-personale');
      return;
    }

    // Conferma email richiesta: nessuna sessione finché l'utente non conferma.
    this.registered.set(true);
  }

  /** Per chi non ha ricevuto la prima (finita nello spam, casella lenta). */
  async resendConfirmation(): Promise<void> {
    if (this.resendState() === 'sending') {
      return;
    }
    this.resendState.set('sending');
    try {
      await this.auth.resendSignupConfirmation(this.form.controls.email.value);
      this.resendState.set('sent');
    } catch {
      this.resendState.set('idle');
      this.errorMessage.set('Invio non riuscito. Riprova tra qualche minuto.');
    }
  }
}
