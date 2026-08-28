import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

export type LessonStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled';

export interface LessonRow {
  id: number;
  customer_id: number;
  slot_id: number | null;
  lesson_type: 'standard' | 'incontro_conoscitivo';
  status: LessonStatus;
  description: string | null;
  date: string;
  time_from: string;
  time_to: string;
  bypass_weekly_limit: boolean;
  customer_name: string;
  customer_surname: string;
  customer_dog_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
}

export const LESSON_STATUS_LABELS: Record<LessonStatus, string> = {
  pending: 'in attesa',
  confirmed: 'confermata',
  rejected: 'rifiutata',
  cancelled: 'cancellata',
};

export interface BookingSettings {
  bookingMinHoursBefore: number;
  cancelMinHoursBefore: number;
}

// Su una riga sola e non concatenata: supabase-js deriva i tipi del risultato
// dal literal della select, e una concatenazione lo degrada a "string".
const LESSON_COLUMNS =
  'id, customer_id, slot_id, lesson_type, status, description, date, time_from, time_to, bypass_weekly_limit, customer_name, customer_surname, customer_dog_name, customer_email, customer_phone';

/**
 * Lettura e gestione delle lezioni già create. La creazione sta in
 * BookingService (RPC book_lesson); qui ci sono cancellazione, modifica ed
 * eliminazione, tutte RPC security definer: l'unica cosa che il client decide
 * è cosa chiedere, mai se è permesso.
 */
@Injectable({ providedIn: 'root' })
export class LessonsService {
  private readonly supabase = inject(SupabaseService).client;

  /** Lezioni di un singolo cliente, dalla più recente. */
  async listForCustomer(customerId: number): Promise<LessonRow[]> {
    const { data, error } = await this.supabase
      .from('v_lessons_detail')
      .select(LESSON_COLUMNS)
      .eq('customer_id', customerId)
      .order('date', { ascending: false })
      .order('time_from', { ascending: false });

    if (error) {
      throw error;
    }
    return data ?? [];
  }

  /** Lezioni da oggi in avanti, per la gestione staff. */
  async listUpcoming(days = 30): Promise<LessonRow[]> {
    const from = toIsoDate(new Date());
    const toDate = new Date();
    toDate.setDate(toDate.getDate() + days - 1);

    const { data, error } = await this.supabase
      .from('v_lessons_detail')
      .select(LESSON_COLUMNS)
      .gte('date', from)
      .lte('date', toIsoDate(toDate))
      .order('date', { ascending: true })
      .order('time_from', { ascending: true });

    if (error) {
      throw error;
    }
    return data ?? [];
  }

  async cancel(lessonId: number): Promise<void> {
    const { error } = await this.supabase.rpc('cancel_lesson', { p_lesson_id: lessonId });
    if (error) {
      throw error;
    }
  }

  /** Sposta la lezione su un altro slot (solo staff). */
  async moveToSlot(lessonId: number, slotId: number, bypassWeeklyLimit = false): Promise<void> {
    const { error } = await this.supabase.rpc('update_lesson', {
      p_lesson_id: lessonId,
      p_slot_id: slotId,
      p_bypass_weekly_limit: bypassWeeklyLimit,
    });
    if (error) {
      throw error;
    }
  }

  async updateDescription(lessonId: number, description: string): Promise<void> {
    const trimmed = description.trim();
    const { error } = await this.supabase.rpc('update_lesson', {
      p_lesson_id: lessonId,
      p_description: trimmed === '' ? null : trimmed,
      p_clear_description: trimmed === '',
    });
    if (error) {
      throw error;
    }
  }

  /** Rimozione amministrativa (solo admin): la lezione sparisce dallo storico. */
  async remove(lessonId: number): Promise<void> {
    const { error } = await this.supabase.rpc('delete_lesson', { p_lesson_id: lessonId });
    if (error) {
      throw error;
    }
  }

  /**
   * Soglie orarie lette dal database: i testi della UI ("puoi cancellare fino
   * a N ore prima") non devono avere una seconda copia del numero in
   * TypeScript, che divergerebbe al primo cambio in app_settings.
   */
  async getBookingSettings(): Promise<BookingSettings> {
    const { data, error } = await this.supabase.rpc('public_booking_settings');
    if (error) {
      throw error;
    }
    const settings = (data ?? {}) as Record<string, number>;
    return {
      bookingMinHoursBefore: settings['booking_min_hours_before'] ?? 36,
      cancelMinHoursBefore: settings['lesson_cancel_min_hours_before'] ?? 3,
    };
  }
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
