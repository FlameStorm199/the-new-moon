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

  /**
   * "Password dimenticata": passa dalla Edge Function manage-user-password,
   * mai da supabase.auth.resetPasswordForEmail() diretta — è il punto unico
   * da cui parte ogni email di password, dove vivono le regole su chi può
   * chiederla e per chi.
   *
   * Non dice mai se l'indirizzo esista o no (la Edge Function risponde
   * sempre allo stesso modo): altrimenti questa pagina diventerebbe un modo
   * per scoprire chi è registrato.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await this.supabase.functions.invoke('manage-user-password', {
      body: { action: 'self_reset_request', email: email.trim().toLowerCase() },
    });
    if (error) {
      throw error;
    }
  }

  /**
   * Imposta la nuova password dopo aver aperto il link di recupero.
   *
   * Qui si usa updateUser() del client, non la Edge Function: la prova di
   * identità è la sessione di recupero che supabase-js ha appena stabilito
   * leggendo i token dal link: non c'è una password attuale da verificare
   * (è quella dimenticata), e nessun ruolo o approvazione viene toccato —
   * i motivi per cui gli altri flussi passano tutti dal server.
   */
  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await this.supabase.auth.updateUser({ password: newPassword });
    if (error) {
      throw error;
    }
  }

  /** Sessione presente adesso, letta dallo storage locale (nessuna rete). */
  async hasSession(): Promise<boolean> {
    const { data } = await this.supabase.auth.getSession();
    return data.session !== null;
  }
}
