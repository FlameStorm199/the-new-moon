import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { SupabaseService } from '../../../../core/supabase/supabase.service';
import { BackLinkComponent } from '../../components/back-link/back-link.component';
import { UserProfileService } from '../../../../core/users/user-profile.service';

interface PendingUser {
  id: number;
  name: string;
  surname: string;
  email: string | null;
  phone: string | null;
  dog_name: string | null;
}

// type_id 1 = customer, 2 = future_customer (vedi user_types in schema_fase1.sql)
const VALIDATABLE_TYPE_IDS = [1, 2];

@Component({
  selector: 'app-utenti-da-validare',
  standalone: true,
  imports: [CommonModule, BackLinkComponent],
  templateUrl: './utenti-da-validare.component.html',
  styleUrl: './utenti-da-validare.component.scss',
})
export class UtentiDaValidareComponent implements OnInit {
  private readonly supabase = inject(SupabaseService).client;
  private readonly profileService = inject(UserProfileService);

  readonly users = signal<PendingUser[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly validatingId = signal<number | null>(null);

  // Un assistente vede questa lista (RLS glielo permette già) ma non può
  // validare: la scrittura su users resta riservata a trainer/admin sia
  // lato RLS (users_update_staff) sia dentro il trigger che la governa
  // (enforce_users_update_rules) — qui solo per non mostrargli un bottone
  // che verrebbe comunque respinto.
  readonly canAct = signal(false);

  ngOnInit(): void {
    void this.load();
    void this.loadRole();
  }

  private async loadRole(): Promise<void> {
    const profile = await this.profileService.getMyProfile();
    const type = profile?.typeCode;
    this.canAct.set(type === 'trainer' || type === 'admin');
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);

    const { data, error } = await this.supabase
      .from('users')
      .select('id, name, surname, email, phone, dog_name')
      .eq('validated', false)
      .in('type_id', VALIDATABLE_TYPE_IDS)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    this.loading.set(false);

    if (error) {
      this.errorMessage.set('Errore nel caricamento degli utenti da validare.');
      return;
    }
    this.users.set(data ?? []);
  }

  async validate(id: number): Promise<void> {
    this.validatingId.set(id);
    const { error } = await this.supabase.from('users').update({ validated: true }).eq('id', id);
    this.validatingId.set(null);

    if (error) {
      this.errorMessage.set('Errore nella validazione. Riprova.');
      return;
    }
    this.users.update((list) => list.filter((u) => u.id !== id));
  }
}
