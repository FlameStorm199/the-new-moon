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

export interface ClosePeriodInput {
  dateFrom: string;
  /** Se omessa, l'operazione riguarda il solo giorno `dateFrom`. */
  dateTo?: string;
  /** null/omesso = intera giornata. */
  partOfDay?: PartOfDay | null;
  /** true = riapri, false = tieni libero. */
  active: boolean;
  reason?: string;
}

export interface ClosePeriodResult {
  days: number;
  occupiedSkipped: number;
}

export interface NewSlotInput {
  date: string;
  partOfDay: PartOfDay;
  timeFrom: string;
  timeTo: string;
}

export type ClosedDayScope = 'giornata' | PartOfDay;

export interface ClosedDay {
  date: string;
  part_of_day: ClosedDayScope;
  reason: string | null;
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

  /**
   * Slot liberi (attivi, non occupati) dei prossimi `days` giorni, per la UI
   * di prenotazione. Default abbondante e non "sincronizzato a mano" con
   * app_settings.slot_horizon_days: la query filtra per data su righe già
   * generate, quindi chiedere più giorni di quanti l'orizzonte ne produca
   * davvero non costa nulla — restituisce solo quello che esiste. Il
   * problema che questo evita: un valore fisso qui (es. 14) smette di
   * mostrare gli slot generati appena qualcuno allarga l'orizzonte lato DB,
   * senza che nulla lo segnali.
   */
  async listAvailable(days = 180): Promise<SlotRow[]> {
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
   * Chiude o riapre un intervallo di date ("tieni libera la giornata / la
   * mattina / il pomeriggio"), vicino o lontano indifferentemente: passa
   * sempre da closed_days (vedi close_period() in
   * database/22_unify_period_closures.sql), che il generatore rispetta a
   * qualunque distanza. Gli slot già prenotati non vengono mai toccati: la
   * RPC li conta e li riporta in `occupiedSkipped`, così lo staff sa che su
   * quelle date restano lezioni da gestire a mano.
   */
  async closePeriod(input: ClosePeriodInput): Promise<ClosePeriodResult> {
    const { data, error } = await this.supabase.rpc('close_period', {
      p_date_from: input.dateFrom,
      p_date_to: input.dateTo ?? input.dateFrom,
      p_part_of_day: input.partOfDay ?? null,
      p_active: input.active,
      p_reason: input.reason?.trim() || null,
    });
    if (error) {
      throw error;
    }
    const result = (data ?? {}) as Record<string, number>;
    return {
      days: result['days'] ?? 0,
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

  /**
   * Tutte le chiusure registrate, vicine e lontane: sono la stessa tabella
   * (vedi closePeriod()), quindi un'unica lista le mostra entrambe — le
   * vicine hanno anche effetto immediato sugli slot già generati, le
   * lontane si vedranno da sole quando il generatore ci arriva.
   */
  async listClosedDays(): Promise<ClosedDay[]> {
    const { data, error } = await this.supabase
      .from('closed_days')
      .select('date, part_of_day, reason')
      .order('date', { ascending: true });
    if (error) {
      throw error;
    }
    return data ?? [];
  }

  /** Riapre esattamente questa riga: creazione e chiusura passano entrambe da closePeriod(). */
  async removeClosedDay(date: string, partOfDay: ClosedDayScope): Promise<void> {
    const { error } = await this.supabase
      .from('closed_days')
      .delete()
      .eq('date', date)
      .eq('part_of_day', partOfDay);
    if (error) {
      throw error;
    }
  }
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
