import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { UserProfileService } from '../users/user-profile.service';

/**
 * Gating solo per UX: la protezione reale è la RLS/trigger sul DB. Questo guard
 * evita solo di mostrare una pagina inutile a chi non è staff.
 */
export const staffGuard: CanActivateFn = async () => {
  const profileService = inject(UserProfileService);
  const router = inject(Router);

  const profile = await profileService.getMyProfile();
  if (!profile) {
    return router.createUrlTree(['/prenotazioni/login']);
  }
  if (profile.typeCode === 'trainer' || profile.typeCode === 'admin') {
    return true;
  }
  return router.createUrlTree(['/prenotazioni/area-personale']);
};
