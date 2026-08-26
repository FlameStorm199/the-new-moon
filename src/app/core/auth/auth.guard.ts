import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SupabaseService } from '../supabase/supabase.service';

/**
 * Verifica la sessione direttamente sul client Supabase (non sul signal di
 * AuthService) per evitare race condition sulla prima navigazione, prima che
 * onAuthStateChange abbia avuto modo di popolare lo stato.
 */
export const authGuard: CanActivateFn = async () => {
  const supabase = inject(SupabaseService).client;
  const router = inject(Router);

  const { data } = await supabase.auth.getSession();
  if (data.session) {
    return true;
  }
  return router.createUrlTree(['/prenotazioni/login']);
};
