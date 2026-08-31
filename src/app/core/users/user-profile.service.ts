import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

export interface CustomerOption {
  id: number;
  name: string;
  surname: string;
  dog_name: string | null;
}

export interface UserProfile {
  id: number;
  typeCode: string;
  name: string;
  surname: string;
  email: string | null;
  phone: string | null;
  dogName: string | null;
  validated: boolean;
}

// user_types (schema_fase1.sql sez. 2): 5 righe fisse, seedate una sola
// volta, mai previsto che cambino in Fase 1. Risolvere il codice così invece
// che con un embed PostgREST ("user_types(code)") evita di dipendere dalla
// cache di relazione di PostgREST — che in prova è tornata null anche con
// type_id e user_types.id verificati corretti lato DB.
const USER_TYPE_CODES: Record<number, string> = {
  1: 'customer',
  2: 'future_customer',
  3: 'assistant',
  4: 'trainer',
  5: 'admin',
};

@Injectable({ providedIn: 'root' })
export class UserProfileService {
  private readonly supabase = inject(SupabaseService).client;

  /** Profilo public.users dell'utente autenticato corrente, o null se non loggato. */
  async getMyProfile(): Promise<UserProfile | null> {
    // getSession() (locale, dallo storage) invece di getUser() (rifà sempre
    // una richiesta di rete per rivalidare il token): getUser() qui era la
    // causa dei caricamenti che restavano bloccati finché non si ricaricava
    // la pagina — un lock interno di supabase-js legato a quella richiesta
    // di rete che a volte non si sblocca. Stessa scelta già fatta in
    // authGuard, per lo stesso motivo (vedi commento lì).
    const { data: sessionData } = await this.supabase.auth.getSession();
    const authUser = sessionData.session?.user;
    if (!authUser) {
      return null;
    }

    const { data, error } = await this.supabase
      .from('users')
      .select('id, type_id, name, surname, email, phone, dog_name, validated')
      .eq('auth_user_id', authUser.id)
      .single();

    if (error || !data) {
      // getMyProfile() ritorna sempre e solo null|profilo alla UI (niente
      // gestione errori sparsa nei componenti): l'errore vero finisce qui,
      // non deve sparire nel nulla o diagnosticare "non è stato possibile
      // caricare il profilo" richiede di indovinare alla cieca.
      if (error) {
        console.error('getMyProfile: query users fallita', error);
      } else {
        console.error(
          `getMyProfile: nessuna riga public.users per auth_user_id=${authUser.id}`
        );
      }
      return null;
    }

    return {
      id: data['id'],
      name: data['name'],
      surname: data['surname'],
      email: data['email'],
      phone: data['phone'],
      dogName: data['dog_name'],
      validated: data['validated'],
      typeCode: USER_TYPE_CODES[data['type_id']] ?? '',
    };
  }

  /**
   * Clienti validati, per le tendine dello staff. La RLS restituisce l'elenco
   * completo solo a chi è staff: per un customer questa query tornerebbe al
   * massimo sé stesso.
   */
  async listValidatedCustomers(): Promise<CustomerOption[]> {
    const { data, error } = await this.supabase
      .from('users')
      .select('id, name, surname, dog_name')
      .eq('validated', true)
      .in('type_id', [1, 2]) // customer, future_customer (user_types in schema_fase1.sql)
      .is('deleted_at', null)
      .order('surname', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      throw error;
    }
    return data ?? [];
  }
}
