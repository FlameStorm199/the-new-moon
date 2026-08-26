import { Injectable, inject, signal } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';

export interface CustomerSignupData {
  name: string;
  surname: string;
  email: string;
  password: string;
  phone: string;
  dogName: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService).client;

  /** Sessione corrente, aggiornata automaticamente da Supabase Auth. */
  readonly session = signal<Session | null>(null);

  constructor() {
    this.supabase.auth.getSession().then(({ data }) => this.session.set(data.session));
    this.supabase.auth.onAuthStateChange((_event, session) => this.session.set(session));
  }

  /**
   * Self-signup: unico ruolo raggiungibile è "customer" (type_id 1), assegnato
   * server-side dal trigger su auth.users — il client non può scegliere un ruolo.
   */
  signUp(data: CustomerSignupData) {
    return this.supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          name: data.name,
          surname: data.surname,
          phone: data.phone,
          dog_name: data.dogName,
        },
      },
    });
  }

  signIn(email: string, password: string) {
    return this.supabase.auth.signInWithPassword({ email, password });
  }

  signOut() {
    return this.supabase.auth.signOut();
  }
}
