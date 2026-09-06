import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';
import { UserProfile, UserProfileService } from '../../../../core/users/user-profile.service';

@Component({
  selector: 'app-area-personale',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './area-personale.component.html',
  styleUrl: './area-personale.component.scss',
})
export class AreaPersonaleComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly profileService = inject(UserProfileService);

  readonly profile = signal<UserProfile | null>(null);
  readonly loadingProfile = signal(true);

  get isStaff(): boolean {
    const type = this.profile()?.typeCode;
    return type === 'trainer' || type === 'admin';
  }

  /**
   * "validated" ha senso solo per un cliente: lo staff non viene mai
   * validato (in fase di creazione quel campo resta al suo default), quindi
   * senza questa eccezione un educatore vedrebbe "account in attesa" e
   * perderebbe i tasti Prenota/Le mie lezioni — stesso controllo già usato
   * in prenota.component.ts e le-mie-lezioni.component.ts.
   */
  get canUsePlatform(): boolean {
    const p = this.profile();
    return !!p && (p.validated || this.isStaff);
  }

  async ngOnInit(): Promise<void> {
    this.profile.set(await this.profileService.getMyProfile());
    this.loadingProfile.set(false);
  }

  async logout(): Promise<void> {
    await this.auth.signOut();
    this.router.navigateByUrl('/prenotazioni/login');
  }
}
