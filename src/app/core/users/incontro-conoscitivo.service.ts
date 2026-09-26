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
 *
 * La Edge Function autentica l'utente in automatico (login silenzioso, vedi
 * i commenti nel suo index.ts) e restituisce i token di sessione: qui li
 * passiamo a supabase.auth.setSession(), che stabilisce la sessione locale
 * esattamente come farebbe un login vero — nessun altro codice da toccare,
 * AuthService.session segue da sé (onAuthStateChange già agganciato lì).
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
    if (data?.warning || !data?.access_token || !data?.refresh_token) {
      // Account creato ma il login automatico non è riuscito (raro, vedi
      // index.ts): non c'è sessione da stabilire, il chiamante deve saperlo
      // per mostrare un messaggio diverso invece di navigare a una pagina
      // di prenotazione dove l'utente risulterebbe non autenticato.
      throw new Error(
        data?.warning ??
          "Richiesta registrata, ma l'accesso automatico non è riuscito. Riprova tra poco.",
      );
    }

    const { error: sessionError } = await this.supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });
    if (sessionError) {
      throw new Error("Richiesta registrata, ma l'accesso automatico non è riuscito. Riprova tra poco.");
    }
  }

  /**
   * Consuma il token del link nella mail di conferma (RPC
   * confirm_incontro_email, database/37_...): nessuna sessione richiesta,
   * funziona anche se il link viene aperto su un altro dispositivo.
   * true = confermata ora; false = token non valido, già usato o prenotazione
   * non più attiva.
   */
  async confirmEmail(token: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('confirm_incontro_email', { p_token: token });
    if (error) {
      throw error;
    }
    return data === 'confirmed';
  }
}
