import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { SOCIAL_LINKS } from '../../core/site/social-links';

interface Phone {
  name: string;
  /** Come si legge, a gruppi. */
  display: string;
  /** Per il link tel:, solo cifre col prefisso. */
  dial: string;
}

/**
 * Aree dove il footer non compare: l'area prenotazioni e l'Incontro
 * Conoscitivo sono applicazioni, non pagine del sito — lì contatti e dati
 * dell'associazione sono rumore sotto un calendario o un form.
 */
const HIDDEN_PREFIXES = ['/prenotazioni', '/incontro-conoscitivo'];

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss'
})
export class FooterComponent {
  private readonly router = inject(Router);

  readonly social = SOCIAL_LINKS;
  /** Calcolato: "2021" fisso restava indietro di anni. */
  readonly currentYear = new Date().getFullYear();

  readonly phones: Phone[] = [
    { name: 'Francesca', display: '348 466 3473', dial: '+393484663473' },
    { name: 'Elisa', display: '347 547 4812', dial: '+393475474812' },
  ];

  readonly visible = signal(isVisibleAt(this.router.url));

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe((event) => this.visible.set(isVisibleAt(event.urlAfterRedirects)));
  }
}

function isVisibleAt(url: string): boolean {
  return !HIDDEN_PREFIXES.some((prefix) => url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`));
}
