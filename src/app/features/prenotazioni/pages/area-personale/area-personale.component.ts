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

  /** Solo trainer/admin: sono gli unici che possono anche prenotare per sé — usato da canUsePlatform. */
  get isStaff(): boolean {
    const type = this.profile()?.typeCode;
    return type === 'trainer' || type === 'admin';
  }

  /**
   * Assistente incluso: vede tutta la sezione Staff (le pagine lì sotto sono
   * ormai in sola lettura per lui, RLS is_staff() — vedi
   * database/21_assistant_read_access.sql), non può solo scriverci. Diversa
   * da isStaff apposta: quella resta stretta a trainer/admin perché governa
   * anche "puoi prenotare una lezione", cosa che un assistente non può fare.
   */
  get isStaffViewer(): boolean {
    const type = this.profile()?.typeCode;
    return type === 'trainer' || type === 'admin' || type === 'assistant';
  }

  /**
   * "validated" ha senso solo per un cliente: lo staff non viene mai
   * validato (in fase di creazione quel campo resta al suo default), quindi
   * senza questa eccezione un educatore vedrebbe "account in attesa" e
   * perderebbe i tasti Prenota/Le mie lezioni — stesso controllo già usato
   * in prenota.component.ts e le-mie-lezioni.component.ts.
   *
   * isStaff qui è solo trainer/admin, non assistente: un assistente non può
   * prenotare (book_lesson lo rifiuta), quindi niente tasti cliente per lui,
   * correttamente — vede invece la sezione Staff tramite isStaffViewer.
   */
  get canUsePlatform(): boolean {
    const p = this.profile();
    return !!p && (p.validated || this.isStaff);
  }

  get isCustomerType(): boolean {
    const type = this.profile()?.typeCode;
    return type === 'customer' || type === 'future_customer';
  }

  /**
   * Il messaggio "in attesa di validazione" ha senso solo per un vero
   * cliente non ancora validato — per un assistente sarebbe falso (non gli
   * servirà mai, validated non lo riguarda), quindi va tenuto zitto invece
   * che mostrargli un'attesa che non finirà mai.
   */
  get showPendingMessage(): boolean {
    const p = this.profile();
    return !!p && this.isCustomerType && !p.validated;
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
