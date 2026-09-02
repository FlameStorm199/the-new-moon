import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';
import { BackLinkComponent } from '../../components/back-link/back-link.component';

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
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
  });

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly registered = signal(false);

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
}
