import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { UserProfileService } from '../users/user-profile.service';

/**
 * Gating solo per UX: la protezione reale è lato Edge Function
 * (admin-create-user, manage-user-password) e RLS. A differenza di
 * staffGuard (trainer o admin), qui serve essere admin: solo l'admin può
 * creare utenti o cambiarne il ruolo, un educatore no.
 */
export const adminGuard: CanActivateFn = async () => {
  const profileService = inject(UserProfileService);
  const router = inject(Router);

  const profile = await profileService.getMyProfile();
  if (!profile) {
    return router.createUrlTree(['/prenotazioni/login']);
  }
  if (profile.typeCode === 'admin') {
    return true;
  }
  return router.createUrlTree(['/prenotazioni/area-personale']);
};
