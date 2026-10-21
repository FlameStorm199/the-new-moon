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
  /** Posti dello slot: >1 = la lezione fa parte di una lezione collettiva. */
  slot_capacity: number;
  slot_group_label: string | null;
}

/** La lezione è l'iscrizione di un cliente a una lezione collettiva. */
export function isGroupLesson(lesson: Pick<LessonRow, 'slot_capacity'>): boolean {
  return lesson.slot_capacity > 1;
}

/** "Incontro conoscitivo", il nome della collettiva ("Classe cuccioli" / "Lezione collettiva") o "Lezione". */
export function lessonKindLabel(lesson: Pick<LessonRow, 'lesson_type' | 'slot_capacity' | 'slot_group_label'>): string {
  if (lesson.lesson_type === 'incontro_conoscitivo') {
    return 'Incontro conoscitivo';
  }
  if (isGroupLesson(lesson)) {
    return lesson.slot_group_label?.trim() || 'Lezione collettiva';
  }
  return 'Lezione';
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
  'id, customer_id, slot_id, lesson_type, status, description, date, time_from, time_to, bypass_weekly_limit, customer_name, customer_surname, customer_dog_name, customer_email, customer_phone, slot_capacity, slot_group_label';

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

  /**
   * L'Incontro Conoscitivo ancora attivo (in attesa o confermato) di un
   * cliente, se c'è: al più uno per persona, garantito dall'indice
   * lessons_one_active_incontro_conoscitivo_unique (database/28_...).
   */
  async findActiveIncontro(customerId: number): Promise<LessonRow | null> {
    const { data, error } = await this.supabase
      .from('v_lessons_detail')
      .select(LESSON_COLUMNS)
      .eq('customer_id', customerId)
      .eq('lesson_type', 'incontro_conoscitivo')
      .in('status', ['pending', 'confirmed'])
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }
    return data;
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

  /**
   * `reason` è la motivazione facoltativa che lo staff può allegare: finisce
   * sulla lezione e nell'email che arriva al cliente. Il customer che
   * cancella da sé non la passa (la UI non gliela chiede).
   */
  async cancel(lessonId: number, reason?: string): Promise<void> {
    const trimmed = reason?.trim();
    const { error } = await this.supabase.rpc('cancel_lesson', {
      p_lesson_id: lessonId,
      p_reason: trimmed ? trimmed : null,
    });
    if (error) {
      throw error;
    }
  }

  /**
   * Accettazione/rifiuto di un Incontro Conoscitivo in attesa (solo
   * trainer/admin — enforced dalla RPC, non qui). `reason` obbligatorio solo
   * per il rifiuto, la RPC lo richiede e lo mette nell'email al cliente.
   */
  async respondIncontroConoscitivo(
    lessonId: number,
    accept: boolean,
    reason?: string
  ): Promise<void> {
    const trimmed = reason?.trim();
    const { error } = await this.supabase.rpc('respond_incontro_conoscitivo', {
      p_lesson_id: lessonId,
      p_accept: accept,
      p_reason: trimmed ? trimmed : null,
    });
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

  /**
   * Sposta tutta la lezione collettiva su un orario libero e individuale,
   * che diventa la collettiva (stessi posti e nome); ogni iscritto riceve la
   * notifica di spostamento. Solo staff, controllato dalla RPC.
   */
  async moveGroupLesson(fromSlotId: number, toSlotId: number): Promise<void> {
    const { error } = await this.supabase.rpc('move_group_lesson', {
      p_from_slot_id: fromSlotId,
      p_to_slot_id: toSlotId,
    });
    if (error) {
      throw error;
    }
  }

  /** Cancella la lezione collettiva per tutti gli iscritti; restituisce quanti erano. */
  async cancelGroupLesson(slotId: number, reason?: string): Promise<number> {
    const trimmed = reason?.trim();
    const { data, error } = await this.supabase.rpc('cancel_group_lesson', {
      p_slot_id: slotId,
      p_reason: trimmed ? trimmed : null,
    });
    if (error) {
      throw error;
    }
    return (data as number | null) ?? 0;
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

  // La rimozione amministrativa (RPC delete_lesson) non è più esposta
  // dall'app: dai test col cliente è emerso che la cancellazione basta, e
  // "Elimina" accanto a "Cancella" era solo un modo per sbagliare. La RPC
  // resta lato database per l'eventuale intervento d'emergenza da SQL editor.

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
