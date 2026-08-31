import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  AdminUserRow,
  AdminUsersService,
  UserTypeCode,
} from '../../../../core/users/admin-users.service';
import { UserProfileService } from '../../../../core/users/user-profile.service';

const TYPE_LABELS: Record<UserTypeCode | '', string> = {
  customer: 'Cliente',
  future_customer: 'Futuro cliente',
  assistant: 'Assistente',
  trainer: 'Educatore',
  admin: 'Amministratore',
  '': 'Sconosciuto',
};

const REQUIRES_PHONE_AND_DOG = new Set<UserTypeCode>(['customer', 'future_customer']);

@Component({
  selector: 'app-gestione-utenti',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './gestione-utenti.component.html',
  styleUrl: './gestione-utenti.component.scss',
})
export class GestioneUtentiComponent implements OnInit {
  private readonly usersService = inject(AdminUsersService);
  private readonly profileService = inject(UserProfileService);
  private readonly fb = inject(FormBuilder);

  readonly users = signal<AdminUserRow[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly infoMessage = signal<string | null>(null);
  readonly creating = signal(false);
  readonly actingOnId = signal<number | null>(null);

  // Un educatore vede l'elenco (RLS glielo permette già), ma creare utenti
  // o gestirne la password resta riservato all'admin — lato server le due
  // Edge Function rifiutano comunque un educatore, questo è solo per non
  // mostrargli controlli che gli verrebbero respinti.
  readonly isAdmin = signal(false);

  readonly typeLabels = TYPE_LABELS;

  readonly form = this.fb.nonNullable.group({
    type_code: this.fb.nonNullable.control<UserTypeCode>('assistant', Validators.required),
    name: ['', Validators.required],
    surname: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phone: [''],
    dog_name: [''],
  });

  readonly requiresPhoneAndDog = computed(() =>
    REQUIRES_PHONE_AND_DOG.has(this.form.controls.type_code.value)
  );

  ngOnInit(): void {
    void this.load();
    void this.loadRole();
  }

  private async loadRole(): Promise<void> {
    const profile = await this.profileService.getMyProfile();
    this.isAdmin.set(profile?.typeCode === 'admin');
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      this.users.set(await this.usersService.list());
    } catch {
      this.errorMessage.set('Errore nel caricamento degli utenti.');
    } finally {
      this.loading.set(false);
    }
  }

  async submitCreate(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    if (REQUIRES_PHONE_AND_DOG.has(value.type_code) && (!value.phone.trim() || !value.dog_name.trim())) {
      this.errorMessage.set('Telefono e nome del cane sono obbligatori per questo ruolo.');
      return;
    }

    this.creating.set(true);
    this.errorMessage.set(null);
    this.infoMessage.set(null);
    try {
      const result = await this.usersService.createUser({
        type_code: value.type_code,
        name: value.name.trim(),
        surname: value.surname.trim(),
        email: value.email.trim(),
        phone: value.phone.trim() || undefined,
        dog_name: value.dog_name.trim() || undefined,
      });
      this.infoMessage.set(
        result.warning ?? "Utente creato. Email di invito inviata per l'impostazione della password."
      );
      this.form.reset({ type_code: 'assistant', name: '', surname: '', email: '', phone: '', dog_name: '' });
      await this.load();
    } catch (err) {
      this.errorMessage.set((err as Error).message || 'Creazione utente fallita.');
    } finally {
      this.creating.set(false);
    }
  }

  async resendInvite(row: AdminUserRow): Promise<void> {
    await this.runOnRow(row.id, () => this.usersService.inviteUser(row.id), 'Invito inviato.');
  }

  async forceReset(row: AdminUserRow): Promise<void> {
    await this.runOnRow(
      row.id,
      () => this.usersService.forceResetPassword(row.id),
      'Email di reimpostazione inviata.'
    );
  }

  private async runOnRow(
    userId: number,
    action: () => Promise<void>,
    successMessage: string
  ): Promise<void> {
    this.actingOnId.set(userId);
    this.errorMessage.set(null);
    this.infoMessage.set(null);
    try {
      await action();
      this.infoMessage.set(successMessage);
    } catch (err) {
      this.errorMessage.set((err as Error).message || 'Operazione fallita.');
    } finally {
      this.actingOnId.set(null);
    }
  }
}
