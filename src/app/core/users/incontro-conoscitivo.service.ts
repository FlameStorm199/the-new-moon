import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import { extractFunctionErrorMessage } from '../supabase/edge-function-error';

export interface IncontroConoscitivoRequestInput {
  name: string;
  surname: string;
  email: string;
  phone: string;
  dogName: string;
}

/**
 * Wrapper della Edge Function pubblica request-incontro-conoscitivo (Fase 2):
 * crea un utente future_customer, mai supabase.auth.signUp() diretto — quella
 * via crea sempre e solo customer (vedi database/02_auth_signup_trigger.sql).
 * Nessun JWT allegato (il chiamante non è loggato): functions.invoke() manda
 * comunque l'header apikey da solo, che è quanto la funzione richiede
 * (auth: ["publishable"]).
 */
@Injectable({ providedIn: 'root' })
export class IncontroConoscitivoService {
  private readonly supabase = inject(SupabaseService).client;

  async request(input: IncontroConoscitivoRequestInput): Promise<void> {
    const { data, error } = await this.supabase.functions.invoke('request-incontro-conoscitivo', {
      body: {
        name: input.name,
        surname: input.surname,
        email: input.email,
        phone: input.phone,
        dog_name: input.dogName,
      },
    });
    if (error) {
      throw new Error(await extractFunctionErrorMessage(error));
    }
    if (data?.error) {
      throw new Error(data.error);
    }
    // data?.warning (email di conferma non partita): l'utente è comunque
    // stato creato, non è un errore da bloccare la UI — vedi index.ts della
    // Edge Function. Il chiamante può ignorarlo o loggarlo, per ora non
    // distinguiamo i due esiti positivi nella UI (v1).
  }
}
