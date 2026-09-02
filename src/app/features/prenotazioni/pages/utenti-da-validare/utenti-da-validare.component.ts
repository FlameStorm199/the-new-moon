import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { SupabaseService } from '../../../../core/supabase/supabase.service';
import { BackLinkComponent } from '../../components/back-link/back-link.component';

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

  readonly users = signal<PendingUser[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly validatingId = signal<number | null>(null);

  ngOnInit(): void {
    void this.load();
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
