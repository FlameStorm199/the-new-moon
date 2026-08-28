import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable({ providedIn: 'root' })
export class BookingService {
  private readonly supabase = inject(SupabaseService).client;

  /**
   * Prenota lo slot per l'utente autenticato corrente. Tutte le regole
   * (36h anticipo, 1 lezione/settimana, validazione account, slot libero)
   * sono enforced dalla RPC book_lesson lato DB, non qui.
   */
  async bookLesson(slotId: number): Promise<void> {
    const { error } = await this.supabase.rpc('book_lesson', { p_slot_id: slotId });
    if (error) {
      throw error;
    }
  }

  /**
   * Prenotazione fatta dallo staff per conto di un cliente. Il bypass del
   * limite settimanale viene comunque riverificato dalla RPC in base al ruolo
   * di chi chiama: passarlo da qui non basta a ottenerlo.
   */
  async bookLessonForCustomer(
    slotId: number,
    customerId: number,
    bypassWeeklyLimit = false,
    description?: string
  ): Promise<void> {
    const { error } = await this.supabase.rpc('book_lesson', {
      p_slot_id: slotId,
      p_customer_id: customerId,
      p_bypass_weekly_limit: bypassWeeklyLimit,
      p_description: description?.trim() || null,
    });
    if (error) {
      throw error;
    }
  }
}
