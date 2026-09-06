import { Component } from '@angular/core';
import { BackLinkComponent } from '../../components/back-link/back-link.component';

/**
 * Pagina a sé, non in navbar: link diretto al PDF già pubblicato in Bacheca
 * (assets/docs/2-Privacy.pdf, lo stesso file, non una copia) più il
 * contatto per chi ha problemi o domande.
 */
@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [BackLinkComponent],
  templateUrl: './privacy.component.html',
  styleUrl: './privacy.component.scss',
})
export class PrivacyComponent {}
