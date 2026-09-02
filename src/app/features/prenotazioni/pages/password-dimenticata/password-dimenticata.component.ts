import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';

@Component({
  selector: 'app-password-dimenticata',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './password-dimenticata.component.html',
  styleUrl: './password-dimenticata.component.scss',
})
export class PasswordDimenticataComponent {
  private readonly auth = inject(AuthService);

  readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
  });

  readonly loading = signal(false);
  readonly sent = signal(false);
  readonly errorMessage = signal<string | null>(null);

  async submit(): Promise<void> {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      await this.auth.requestPasswordReset(this.form.getRawValue().email);
      // Esito identico sia che l'indirizzo esista sia che non esista: la
      // conferma parla di "se l'indirizzo è registrato" proprio per non
      // rivelare quali email sono censite.
      this.sent.set(true);
    } catch {
      this.errorMessage.set('Non è stato possibile inviare l’email. Riprova tra poco.');
    } finally {
      this.loading.set(false);
    }
  }
}
