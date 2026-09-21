import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IncontroConoscitivoService } from '../../../../core/users/incontro-conoscitivo.service';
import { BackLinkComponent } from '../../components/back-link/back-link.component';

/**
 * Pagina pubblica (Fase 2), nessun login richiesto: crea un future_customer
 * tramite la Edge Function request-incontro-conoscitivo, che manda poi
 * un'email di conferma. Niente password qui — a differenza di
 * register.component (self-signup customer) — la password arriva solo più
 * avanti, con l'invito manuale dello staff dopo l'incontro (giorno 5).
 *
 * Fuori navbar per scelta del centro (stessa nota valida per tutta l'area
 * /prenotazioni), raggiungibile solo da URL diretto: /incontro-conoscitivo.
 */
@Component({
  selector: 'app-incontro-conoscitivo',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, BackLinkComponent],
  templateUrl: './incontro-conoscitivo.component.html',
  styleUrl: './incontro-conoscitivo.component.scss',
})
export class IncontroConoscitivoComponent {
  private readonly incontroConoscitivo = inject(IncontroConoscitivoService);

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    surname: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    phone: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    dogName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly submitted = signal(false);

  async submit(): Promise<void> {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);
    const value = this.form.getRawValue();

    try {
      await this.incontroConoscitivo.request(value);
      this.submitted.set(true);
    } catch (err) {
      const message = (err as Error | null)?.message;
      this.errorMessage.set(
        message?.includes('already been registered') || message?.includes('già registrat')
          ? 'Esiste già una richiesta con questa email. Controlla la posta (anche lo spam) per il link di conferma, oppure contatta il centro.'
          : message || 'Richiesta non riuscita. Riprova.'
      );
    } finally {
      this.loading.set(false);
    }
  }
}
