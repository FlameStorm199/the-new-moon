import { CommonModule } from '@angular/common';
import { Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { UserProfile, UserProfileService } from '../../core/users/user-profile.service';
import { SOCIAL_LINKS } from '../../core/site/social-links';

interface NavItem {
  path: string;
  label: string;
  /** Solo per "Home": senza, resterebbe evidenziata su ogni sottopagina. */
  exact?: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  customer: 'Assistito',
  future_customer: 'Nuovo assistito',
  assistant: 'Assistente',
  trainer: 'Educatore',
  admin: 'Amministratore',
};

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

  facebookPonzanoUrl = SOCIAL_LINKS.facebookPonzano;
  facebookGeneralUrl = SOCIAL_LINKS.facebookGeneral;
  instagramUrl = SOCIAL_LINKS.instagram;
  fbDropdownOpen = false;

  /** Pannello dei link su schermo stretto. Sopra la soglia il CSS lo ignora. */
  menuOpen = false;

  /** Menu dell'account (nome, ruolo, Esci), solo nell'area prenotazioni. */
  accountOpen = false;
  loggingOut = false;

  /** Ombra sotto l'header solo dopo aver scrollato: a inizio pagina resta pulito. */
  scrolled = false;

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
        this.accountOpen = false;
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

  /**
   * Il riquadro "sei collegato come…": solo dentro l'area prenotazioni.
   * Sul sito pubblico non compare mai, nemmeno da loggati — il sito non
   * deve rimandare in nessun modo all'area riservata.
   */
  readonly account = computed(() => {
    const p = this.profile();
    if (!this.inBookingArea() || !p) {
      return null;
    }
    const fullName = `${p.name} ${p.surname}`.trim();
    const initials = `${p.name.charAt(0)}${p.surname.charAt(0)}`.toUpperCase() || '?';
    return {
      firstName: p.name,
      fullName,
      initials,
      email: p.email,
      roleLabel: ROLE_LABELS[p.typeCode] ?? '',
      roleCode: p.typeCode,
    };
  });

  readonly links = computed<NavItem[]>(() => {
    if (!this.inBookingArea()) {
      return PUBLIC_LINKS;
    }

    const profile = this.profile()!;
    const isStaff = profile.typeCode === 'trainer' || profile.typeCode === 'admin';
    // Assistente incluso: vede le stesse pagine di gestione di trainer/admin
    // (sola lettura lì, RLS is_staff() — vedi database/21_assistant_read_access.sql).
    // Diverso da isStaff apposta: quello resta stretto a trainer/admin perché
    // governa anche le azioni di scrittura vere e proprie sul calendario.
    const isStaffViewer = isStaff || profile.typeCode === 'assistant';
    const items: NavItem[] = [
      { path: '/prenotazioni/area-personale', label: 'Home', exact: true },
    ];

    // Un cliente non ancora validato non ha nulla da prenotare: mostrargli
    // le voci porterebbe solo a pagine che gli dicono di aspettare. Per lo
    // staff invece questi due tab restano, ma non qui: mescolati alle voci
    // di gestione confondevano chi testava la piattaforma (sembravano "le
    // stesse tab dei clienti"). Restano raggiungibili dal link piccolo
    // "Area assistito" in area-personale, non dalla navbar.
    //
    // future_customer (Fase 2): stesso motivo già corretto in
    // canBook/canUsePlatform (prenota/area-personale/le-mie-lezioni) — non è
    // mai "validated" prima dell'Incontro Conoscitivo, "profile.validated"
    // da solo lo escluderebbe qui esattamente come li escludeva lì.
    const canUseBookingArea = profile.validated || profile.typeCode === 'future_customer';
    if (canUseBookingArea && !isStaff) {
      items.push(
        { path: '/prenotazioni/prenota', label: 'Prenota' },
        { path: '/prenotazioni/le-mie-lezioni', label: 'Le mie lezioni' },
        { path: '/prenotazioni/eventi', label: 'Eventi' }
      );
    }

    if (isStaffViewer) {
      items.push(
        { path: '/prenotazioni/gestione-lezioni', label: 'Lezioni' },
        { path: '/prenotazioni/gestione-chiusure', label: 'Chiusure' },
        { path: '/prenotazioni/fasce-orarie', label: 'Fasce orarie' },
        { path: '/prenotazioni/gestione-utenti', label: 'Utenti' },
        { path: '/prenotazioni/gestione-eventi', label: 'Eventi' }
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
    // I pannelli non convivono: aprirne uno chiude gli altri.
    this.fbDropdownOpen = false;
    this.accountOpen = false;
  }

  toggleAccount(event: Event) {
    event.stopPropagation();
    this.accountOpen = !this.accountOpen;
    this.menuOpen = false;
    this.fbDropdownOpen = false;
  }

  async logout(): Promise<void> {
    this.loggingOut = true;
    try {
      await this.auth.signOut();
      this.accountOpen = false;
      await this.router.navigateByUrl('/prenotazioni/login');
    } finally {
      this.loggingOut = false;
    }
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
    this.accountOpen = false;
  }

  @HostListener('window:scroll')
  onScroll() {
    const next = window.scrollY > 8;
    if (next !== this.scrolled) {
      this.scrolled = next;
    }
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.fbDropdownOpen = false;
    this.menuOpen = false;
    this.accountOpen = false;
  }
}
