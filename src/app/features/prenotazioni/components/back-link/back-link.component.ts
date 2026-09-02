import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Ritorno alla pagina precedente nella gerarchia — non la storia del
 * browser: `history.back()` porterebbe dove si era prima, che dopo un
 * salvataggio o un arrivo da link diretto non è detto sia un posto sensato.
 * Un percorso esplicito porta sempre dove ci si aspetta.
 *
 * Le regole sono prefissate con `:host` perché il tema globale
 * (`html body .staff-page a`, e simili) batterebbe per specificità un
 * semplice `.back-link`.
 */
@Component({
  selector: 'app-back-link',
  standalone: true,
  imports: [RouterLink],
  template: `
    <a class="back-link" [routerLink]="to">
      <span class="arrow" aria-hidden="true">←</span>
      {{ label }}
    </a>
  `,
  styles: [
    `
      :host {
        display: block;
        margin-bottom: 0.75rem;
      }

      :host .back-link {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.85rem;
        font-weight: 600;
        color: #666;
        text-decoration: none;
      }

      :host .back-link:hover {
        color: var(--pn-accent, #3b6fd4);
        text-decoration: none;
      }

      :host .arrow {
        font-size: 1rem;
        line-height: 1;
      }
    `,
  ],
})
export class BackLinkComponent {
  /** Dove si torna. Di default l'area personale, che è l'hub delle pagine. */
  @Input() to = '/prenotazioni/area-personale';
  @Input() label = 'Area personale';
}
