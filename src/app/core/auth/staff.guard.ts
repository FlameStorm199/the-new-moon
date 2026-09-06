import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { UserProfileService } from '../users/user-profile.service';

/**
 * Gating solo per UX: la protezione reale è la RLS/trigger sul DB. Questo guard
 * evita solo di mostrare una pagina inutile a chi non è staff.
 *
 * "Staff" qui include l'assistente: vede tutte queste pagine (le RLS di sola
 * lettura sono is_staff(), vedi database/21_assistant_read_access.sql), ma
 * non può agire — le scritture restano riservate a trainer/admin sia via RLS
 * sia dentro le RPC, e ogni pagina nasconde i controlli che comunque
 * verrebbero respinti.
 */
export const staffGuard: CanActivateFn = async () => {
  const profileService = inject(UserProfileService);
  const router = inject(Router);

  const profile = await profileService.getMyProfile();
  if (!profile) {
    return router.createUrlTree(['/prenotazioni/login']);
  }
  if (
    profile.typeCode === 'trainer' ||
    profile.typeCode === 'admin' ||
    profile.typeCode === 'assistant'
  ) {
    return true;
  }
  return router.createUrlTree(['/prenotazioni/area-personale']);
};
