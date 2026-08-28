import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import { PartOfDay } from './slots.service';

export interface TimeSlotRuleRow {
  id: number;
  weekday: number; // 0 = domenica … 6 = sabato (convenzione Postgres dow)
  part_of_day: PartOfDay;
  time_from: string;
  time_to: string;
  active: boolean;
}

export interface NewTimeSlotRuleInput {
  weekday: number;
  partOfDay: PartOfDay;
  timeFrom: string;
  timeTo: string;
}

/**
 * Fasce orarie di apertura. Ogni scrittura fa scattare lato DB il ricalcolo
 * immediato degli slot futuri (trigger trg_tsr_recalc_slots), quindi dopo
 * ogni chiamata la lista degli slot va considerata cambiata.
 */
@Injectable({ providedIn: 'root' })
export class TimeSlotRulesService {
  private readonly supabase = inject(SupabaseService).client;

  async list(): Promise<TimeSlotRuleRow[]> {
    const { data, error } = await this.supabase
      .from('time_slot_rules')
      .select('id, weekday, part_of_day, time_from, time_to, active')
      .is('deleted_at', null)
      .order('weekday', { ascending: true })
      .order('time_from', { ascending: true });

    if (error) {
      throw error;
    }
    return data ?? [];
  }

  async create(input: NewTimeSlotRuleInput): Promise<void> {
    const { error } = await this.supabase.from('time_slot_rules').insert({
      weekday: input.weekday,
      part_of_day: input.partOfDay,
      time_from: input.timeFrom,
      time_to: input.timeTo,
    });
    if (error) {
      throw error;
    }
  }

  async updateHours(id: number, timeFrom: string, timeTo: string): Promise<void> {
    const { error } = await this.supabase
      .from('time_slot_rules')
      .update({ time_from: timeFrom, time_to: timeTo })
      .eq('id', id);
    if (error) {
      throw error;
    }
  }

  async setActive(id: number, active: boolean): Promise<void> {
    const { error } = await this.supabase
      .from('time_slot_rules')
      .update({ active })
      .eq('id', id);
    if (error) {
      throw error;
    }
  }

  /**
   * Soft delete: niente policy DELETE su time_slot_rules, la cancellazione
   * passa dalla UPDATE di deleted_at (che è anche ciò che fa scattare il
   * ricalcolo degli slot).
   */
  async softDelete(id: number): Promise<void> {
    const { error } = await this.supabase
      .from('time_slot_rules')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      throw error;
    }
  }
}
