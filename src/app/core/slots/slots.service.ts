import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

export type PartOfDay = 'mattina' | 'pomeriggio';

export interface SlotRow {
  id: number;
  date: string;
  part_of_day: PartOfDay;
  time_from: string;
  time_to: string;
  active: boolean;
  occupied: boolean;
  /** 'rule' = generato dalle fasce orarie, 'manual' = aggiunto a mano dallo staff. */
  source: SlotSource;
}

export type SlotSource = 'rule' | 'manual';

export interface BulkSlotInput {
  dateFrom: string;
  /** Se omessa, l'operazione riguarda il solo giorno `dateFrom`. */
  dateTo?: string;
  /** null/omesso = intera giornata. */
  partOfDay?: PartOfDay | null;
  active: boolean;
}

export interface BulkSlotResult {
  updated: number;
  occupiedSkipped: number;
}

export interface NewSlotInput {
  date: string;
  partOfDay: PartOfDay;
  timeFrom: string;
  timeTo: string;
}

@Injectable({ providedIn: 'root' })
export class SlotsService {
  private readonly supabase = inject(SupabaseService).client;

  /** Slot (con stato occupato calcolato) dei prossimi `days` giorni, oggi incluso. */
  async listUpcoming(days = 7): Promise<SlotRow[]> {
    const from = toIsoDate(new Date());
    const toDate = new Date();
    toDate.setDate(toDate.getDate() + days - 1);
    const to = toIsoDate(toDate);

    const { data, error } = await this.supabase
      .from('v_slots_status')
      .select('id, date, part_of_day, time_from, time_to, active, occupied, source')
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true })
      .order('time_from', { ascending: true });

    if (error) {
      throw error;
    }
    return data ?? [];
  }

  /** Slot liberi (attivi, non occupati) dei prossimi `days` giorni, per la UI di prenotazione. */
  async listAvailable(days = 14): Promise<SlotRow[]> {
    const from = toIsoDate(new Date());
    const toDate = new Date();
    toDate.setDate(toDate.getDate() + days - 1);
    const to = toIsoDate(toDate);

    const { data, error } = await this.supabase
      .from('v_slots_status')
      .select('id, date, part_of_day, time_from, time_to, active, occupied, source')
      .gte('date', from)
      .lte('date', to)
      .eq('active', true)
      .eq('occupied', false)
      .order('date', { ascending: true })
      .order('time_from', { ascending: true });

    if (error) {
      throw error;
    }
    return data ?? [];
  }

  async setActive(id: number, active: boolean): Promise<void> {
    const { error } = await this.supabase.from('slots').update({ active }).eq('id', id);
    if (error) {
      throw error;
    }
  }

  /**
   * Attiva/disattiva in blocco gli slot di un intervallo ("tieni libera la
   * giornata / la mattina / il pomeriggio"). Gli slot già prenotati non
   * vengono toccati: la RPC li conta e li riporta in `occupiedSkipped`, così
   * lo staff sa che su quelle date restano lezioni da gestire a mano.
   */
  async setActiveBulk(input: BulkSlotInput): Promise<BulkSlotResult> {
    const { data, error } = await this.supabase.rpc('set_slots_active_bulk', {
      p_date_from: input.dateFrom,
      p_date_to: input.dateTo ?? input.dateFrom,
      p_part_of_day: input.partOfDay ?? null,
      p_active: input.active,
    });
    if (error) {
      throw error;
    }
    const result = (data ?? {}) as Record<string, number>;
    return {
      updated: result['updated'] ?? 0,
      occupiedSkipped: result['occupied_skipped'] ?? 0,
    };
  }

  /**
   * Slot aggiunto a mano dallo staff: nasce con source='manual' perché il
   * ricalcolo automatico (trigger sulle fasce orarie) non lo cancelli, non
   * corrispondendo per definizione a nessuna fascia.
   */
  async createSlot(input: NewSlotInput): Promise<void> {
    const { error } = await this.supabase.from('slots').insert({
      date: input.date,
      part_of_day: input.partOfDay,
      time_from: input.timeFrom,
      time_to: input.timeTo,
      source: 'manual',
    });
    if (error) {
      throw error;
    }
  }
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
