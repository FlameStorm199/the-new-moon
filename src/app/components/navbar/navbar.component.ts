import { CommonModule } from '@angular/common';
import { Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { UserProfile, UserProfileService } from '../../core/users/user-profile.service';

interface NavItem {
  path: string;
  label: string;
  /** Solo per "Home": senza, resterebbe evidenziata su ogni sottopagina. */
  exact?: boolean;
}

const PUBLIC_LINKS: NavItem[] = [
  { path: '/', label: 'Home page', exact: true },
  { path: '/about', label: 'Chi siamo' },
  { path: '/locations', label: 'Le nostre sedi' },
  { path: '/activities', label: 'Le nostre attività' },
  { path: '/news', label: 'News' },
  { path: '/download', label: 'Bacheca' },
];

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, CommonModule],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss'
})
export class NavbarComponent {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly profileService = inject(UserProfileService);

  facebookPonzanoUrl = 'https://www.facebook.com/profile.php?id=100093541022280';
  facebookGeneralUrl = 'https://www.facebook.com/share/1P2AEUbsr8/?mibextid=wwXIfr';
  instagramUrl = 'https://www.instagram.com/asdcinofila_lalunanuovaponzano?igsh=aDFnY3dobXVvZXA5&utm_source=ig_contact_invite';
  fbDropdownOpen = false;

  /** Pannello dei link su schermo stretto. Sopra la soglia il CSS lo ignora. */
  menuOpen = false;

  private readonly currentUrl = signal(this.router.url);
  private readonly profile = signal<UserProfile | null>(null);
  /** Evita di rileggere il profilo a ogni navigazione se l'utente è lo stesso. */
  private loadedForAuthUserId: string | null = null;

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe((event) => {
        this.currentUrl.set(event.urlAfterRedirects);
        // Chiude il pannello dopo la navigazione: il clic su un link è già
        // gestito dal listener sul documento, ma un ritorno col tasto
        // indietro del browser no.
        this.menuOpen = false;
        void this.syncProfile();
      });

    // Non basta agganciarsi alle navigazioni: al login la sessione può
    // arrivare un istante DOPO che la pagina è cambiata, e al logout non
    // c'è necessariamente una navigazione. Qui la navbar segue la sessione
    // in sé, così passa da pubblica a prenotazioni (e viceversa) da sola.
    effect(() => {
      this.auth.session();
      void this.syncProfile();
    }, { allowSignalWrites: true });

    void this.syncProfile();
  }

  /**
   * La navbar cambia solo dentro l'area prenotazioni e solo a sessione
   * attiva: su accesso e registrazione, dove il profilo non c'è ancora,
   * resta quella pubblica.
   */
  readonly inBookingArea = computed(
    () => this.currentUrl().startsWith('/prenotazioni') && this.profile() !== null
  );

  readonly links = computed<NavItem[]>(() => {
    if (!this.inBookingArea()) {
      return PUBLIC_LINKS;
    }

    const profile = this.profile()!;
    const isStaff = profile.typeCode === 'trainer' || profile.typeCode === 'admin';
    const items: NavItem[] = [
      { path: '/prenotazioni/area-personale', label: 'Home', exact: true },
    ];

    // Un cliente non ancora validato non ha nulla da prenotare: mostrargli
    // le voci porterebbe solo a pagine che gli dicono di aspettare.
    if (profile.validated || isStaff) {
      items.push(
        { path: '/prenotazioni/prenota', label: 'Prenota' },
        { path: '/prenotazioni/le-mie-lezioni', label: 'Le mie lezioni' }
      );
    }

    if (isStaff) {
      items.push(
        { path: '/prenotazioni/gestione-lezioni', label: 'Lezioni' },
        { path: '/prenotazioni/gestione-slot', label: 'Slot' },
        { path: '/prenotazioni/fasce-orarie', label: 'Fasce orarie' },
        { path: '/prenotazioni/utenti-da-validare', label: 'Da validare' },
        { path: '/prenotazioni/gestione-utenti', label: 'Utenti' }
      );
    }

    return items;
  });

  private async syncProfile(): Promise<void> {
    const authUserId = this.auth.session()?.user?.id ?? null;

    if (!authUserId) {
      this.loadedForAuthUserId = null;
      this.profile.set(null);
      return;
    }
    if (authUserId === this.loadedForAuthUserId) {
      return;
    }

    this.loadedForAuthUserId = authUserId;
    this.profile.set(await this.profileService.getMyProfile());
  }

  toggleMenu(event: Event) {
    event.stopPropagation();
    this.menuOpen = !this.menuOpen;
    // I due pannelli non convivono: aprirne uno chiude l'altro.
    this.fbDropdownOpen = false;
  }

  toggleFbDropdown(event: Event) {
    event.stopPropagation();
    this.fbDropdownOpen = !this.fbDropdownOpen;
    this.menuOpen = false;
  }

  closeFbDropdown() {
    this.fbDropdownOpen = false;
  }

  /**
   * Un clic ovunque chiude i pannelli aperti. Vale anche per i link del menu:
   * navigando, il pannello si chiude da sé senza doverlo gestire a parte.
   */
  @HostListener('document:click')
  onDocumentClick() {
    this.fbDropdownOpen = false;
    this.menuOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.fbDropdownOpen = false;
    this.menuOpen = false;
  }
}
