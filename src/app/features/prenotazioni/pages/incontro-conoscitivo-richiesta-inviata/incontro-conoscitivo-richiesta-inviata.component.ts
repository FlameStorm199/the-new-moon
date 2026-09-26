import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LessonRow, LessonsService } from '../../../../core/lessons/lessons.service';
import { UserProfileService } from '../../../../core/users/user-profile.service';
import { formatLongDate, formatTimeRange } from '../../components/date-format';

/**
 * Riepilogo dopo la prenotazione dell'Incontro Conoscitivo, al posto della
 * ricevuta dentro il modale: la pagina di prenotazione viene sostituita
 * nella cronologia (replaceUrl), e rimanda qui da sola se l'Incontro esiste
 * già — l'utente non torna al calendario.
 *
 * Legge l'Incontro dal database invece di riceverlo dalla pagina
 * precedente: resta corretta anche ricaricandola o riaprendola più tardi.
 */
@Component({
  selector: 'app-incontro-conoscitivo-richiesta-inviata',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './incontro-conoscitivo-richiesta-inviata.component.html',
  // Stesso aspetto della pagina di conferma email (stessa famiglia, stessa
  // card centrata e stesso cerchio): un foglio di stile solo, non due copie.
  styleUrl: '../incontro-conoscitivo-confermato/incontro-conoscitivo-confermato.component.scss',
})
export class IncontroConoscitivoRichiestaInviataComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly profileService = inject(UserProfileService);
  private readonly lessonsService = inject(LessonsService);

  readonly loading = signal(true);
  readonly incontro = signal<LessonRow | null>(null);
  readonly errorMessage = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const profile = await this.profileService.getMyProfile();
    if (!profile) {
      this.router.navigateByUrl('/prenotazioni/login', { replaceUrl: true });
      return;
    }

    try {
      const incontro = await this.lessonsService.findActiveIncontro(profile.id);
      if (!incontro) {
        // Niente da riepilogare (mai prenotato, o annullato): si torna alla
        // scelta dell'orario, se è ancora un future_customer.
        this.router.navigateByUrl(
          profile.typeCode === 'future_customer'
            ? '/prenotazioni/prenota-incontro-conoscitivo'
            : '/prenotazioni/area-personale',
          { replaceUrl: true }
        );
        return;
      }
      this.incontro.set(incontro);
    } catch {
      this.errorMessage.set('Non riusciamo a caricare la tua richiesta. Riprova tra qualche minuto.');
    } finally {
      this.loading.set(false);
    }
  }

  dateLabel(lesson: LessonRow): string {
    return formatLongDate(lesson.date);
  }

  timeLabel(lesson: LessonRow): string {
    return formatTimeRange(lesson.time_from, lesson.time_to);
  }
}
