import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

export interface EventRow {
  id: number;
  title: string;
  description: string | null;
  price: number | null;
  date: string;
  time_from: string;
  time_to: string;
  location: string;
  /** null = nessun limite (Fase 2, vedi database/27_fase2_events_revision.sql). */
  max_customers: number | null;
  active_registrations: number;
  /** id della propria iscrizione attiva, null se non iscritto/a — per il badge "iscritto". */
  my_registration_id: number | null;
}

const PRICE_FORMAT = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

/** "25,00 €" o "Gratuito": stessa etichetta nella pagina staff e in quella clienti. */
export function formatEventPrice(price: number): string {
  return price === 0 ? 'Gratuito' : PRICE_FORMAT.format(price);
}

export interface EventInput {
  title: string;
  location: string;
  date: string;
  timeFrom: string;
  timeTo: string;
  maxCustomers: number | null;
  price: number | null;
  description: string | null;
}

const EVENT_COLUMNS =
  'id, title, description, price, date, time_from, time_to, location, max_customers, active_registrations, my_registration_id';

/**
 * CRUD eventi (staff) + lettura condivisa con la UI customer/assistant
 * (v_events_summary espone già il conteggio iscritti e la propria iscrizione,
 * vedi database/32_fase2_events_summary_view.sql — nessuna differenza di
 * query tra le due UI, solo di cosa mostrano/permettono).
 */
@Injectable({ providedIn: 'root' })
export class EventsService {
  private readonly supabase = inject(SupabaseService).client;

  /**
   * Eventi da oggi in avanti: quelli passati "spariscono da soli" dalla
   * vista per scelta di design (handoff_fase2.md, sez. "Storico eventi") —
   * nessuna cancellazione fisica necessaria solo per non mostrarli più.
   */
  async listUpcoming(): Promise<EventRow[]> {
    const today = toIsoDate(new Date());
    const { data, error } = await this.supabase
      .from('v_events_summary')
      .select(EVENT_COLUMNS)
      .gte('date', today)
      .order('date', { ascending: true })
      .order('time_from', { ascending: true });

    if (error) {
      throw error;
    }
    return data ?? [];
  }

  async create(input: EventInput): Promise<void> {
    const { error } = await this.supabase.rpc('create_event', {
      p_title: input.title,
      p_location: input.location,
      p_date: input.date,
      p_time_from: input.timeFrom,
      p_time_to: input.timeTo,
      p_max_customers: input.maxCustomers,
      p_price: input.price,
      p_description: input.description,
    });
    if (error) {
      throw error;
    }
  }

  async update(eventId: number, input: EventInput): Promise<void> {
    const { error } = await this.supabase.rpc('update_event', {
      p_event_id: eventId,
      p_title: input.title,
      p_location: input.location,
      p_date: input.date,
      p_time_from: input.timeFrom,
      p_time_to: input.timeTo,
      p_max_customers: input.maxCustomers,
      p_price: input.price,
      p_description: input.description,
    });
    if (error) {
      throw error;
    }
  }

  /**
   * `reason` è facoltativo: se compilato finisce sulle iscrizioni cancellate
   * e nell'email a chi era iscritto (delete_event cancella anche quelle,
   * vedi database/33_fase2_delete_event_cancels_registrations.sql).
   */
  async delete(eventId: number, reason?: string): Promise<void> {
    const trimmed = reason?.trim();
    const { error } = await this.supabase.rpc('delete_event', {
      p_event_id: eventId,
      p_reason: trimmed ? trimmed : null,
    });
    if (error) {
      throw error;
    }
  }
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
