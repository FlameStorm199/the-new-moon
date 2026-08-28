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
}
