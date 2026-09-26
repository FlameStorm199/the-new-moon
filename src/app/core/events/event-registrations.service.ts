import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

export interface EventRegistrationRow {
  id: number;
  event_id: number;
  customer_id: number;
  status: 'active' | 'cancelled';
  cancellation_note: string | null;
  customer_name: string;
  customer_surname: string;
  customer_dog_name: string | null;
  /** Per contattare l'iscritto dalla lista dello staff. */
  customer_email: string | null;
}

const REGISTRATION_COLUMNS =
  'id, event_id, customer_id, status, cancellation_note, customer_name, customer_surname, customer_dog_name, customer_email';

/**
 * Iscrizione self-service istantanea, niente approvazione staff (decisione
 * esplicita — vedi handoff_fase2.md, contraddice la sez. 16 del documento
 * originale). Le tre RPC sono in database/31_fase2_events_registrations.sql.
 */
@Injectable({ providedIn: 'root' })
export class EventRegistrationsService {
  private readonly supabase = inject(SupabaseService).client;

  /** Iscritti attivi di un evento, per la UI staff ("Gestione eventi"). */
  async listForEvent(eventId: number): Promise<EventRegistrationRow[]> {
    const { data, error } = await this.supabase
      .from('v_event_registrations_detail')
      .select(REGISTRATION_COLUMNS)
      .eq('event_id', eventId)
      .eq('status', 'active')
      .order('customer_surname', { ascending: true });

    if (error) {
      throw error;
    }
    return data ?? [];
  }

  async register(eventId: number): Promise<void> {
    const { error } = await this.supabase.rpc('register_for_event', { p_event_id: eventId });
    if (error) {
      throw error;
    }
  }

  /** Cancellazione volontaria, propria — mai una nota (quella è solo per la rimozione forzata). */
  async cancel(registrationId: number): Promise<void> {
    const { error } = await this.supabase.rpc('cancel_event_registration', {
      p_registration_id: registrationId,
    });
    if (error) {
      throw error;
    }
  }

  /** Rimozione forzata (solo staff): nota obbligatoria, finisce nell'email al cliente rimosso. */
  async adminRemove(registrationId: number, note: string): Promise<void> {
    const { error } = await this.supabase.rpc('admin_remove_event_registration', {
      p_registration_id: registrationId,
      p_note: note,
    });
    if (error) {
      throw error;
    }
  }
}
