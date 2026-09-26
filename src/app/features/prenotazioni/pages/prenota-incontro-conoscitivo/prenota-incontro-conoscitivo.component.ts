import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BookingService } from '../../../../core/lessons/booking.service';
import { LessonsService } from '../../../../core/lessons/lessons.service';
import { SlotRow, SlotsService } from '../../../../core/slots/slots.service';
import { UserProfile, UserProfileService } from '../../../../core/users/user-profile.service';
import { IncontroBookingDialogComponent } from '../../components/incontro-booking-dialog/incontro-booking-dialog.component';

/** Riepilogo dopo la prenotazione: vedi incontro-conoscitivo-richiesta-inviata.component.ts. */
const RIEPILOGO_URL = '/prenotazioni/incontro-conoscitivo-richiesta-inviata';
import { WeekCalendarComponent } from '../../components/week-calendar/week-calendar.component';

/**
 * Copia di prenota.component.ts, adattata all'Incontro Conoscitivo (richiesta
 * esplicita, "togliendo tutti i riferimenti a lezione e sostituendoli con
 * incontro conoscitivo"): componente dedicato invece di aggiungere un quinto
 * ramo di ruolo a quello esistente, che già ne gestisce quattro
 * (customer/assistant/trainer/admin) — qui la platea è UNA sola
 * (future_customer, appena autenticato in automatico da
 * request-incontro-conoscitivo) e non ha senso portarsi dietro tutta quella
 * logica di ruolo per un caso solo.
 *
 * book_lesson (database/28_fase2_incontro_conoscitivo_booking.sql) sceglie
 * da sé lesson_type='incontro_conoscitivo' e status='pending' quando il
 * cliente della prenotazione è future_customer: nessuna RPC nuova, si
 * riusa BookingService.bookLesson() esattamente com'è.
 */
@Component({
  selector: 'app-prenota-incontro-conoscitivo',
  standalone: true,
  imports: [CommonModule, WeekCalendarComponent, IncontroBookingDialogComponent],
  templateUrl: './prenota-incontro-conoscitivo.component.html',
  styleUrl: './prenota-incontro-conoscitivo.component.scss',
})
export class PrenotaIncontroConoscitivoComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly slotsService = inject(SlotsService);
  private readonly bookingService = inject(BookingService);
  private readonly profileService = inject(UserProfileService);
  private readonly lessonsService = inject(LessonsService);

  readonly bookingMinHours = signal<number | null>(null);
  readonly profile = signal<UserProfile | null>(null);
  readonly loadingProfile = signal(true);
  readonly slots = signal<SlotRow[]>([]);
  readonly loadingSlots = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly bookingId = signal<number | null>(null);

  readonly dialogSlot = signal<SlotRow | null>(null);
  readonly dialogError = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const profile = await this.profileService.getMyProfile();
    this.profile.set(profile);
    this.loadingProfile.set(false);

    // Pagina raggiungibile solo appena dopo request-incontro-conoscitivo
    // (login automatico): chiunque altro ci arrivasse (un customer già
    // promosso che torna indietro col browser, un utente non loggato) va
    // rimandato altrove — book_lesson accetterebbe comunque la chiamata da
    // un customer/assistant/staff, ma produrrebbe una lezione 'standard'
    // etichettata come "Incontro Conoscitivo" in questa pagina, fuorviante.
    if (!profile) {
      this.router.navigateByUrl('/prenotazioni/login');
      return;
    }
    if (profile.typeCode !== 'future_customer') {
      this.router.navigateByUrl('/prenotazioni/area-personale');
      return;
    }

    // Incontro già prenotato: niente calendario, si va al riepilogo. Copre
    // anche chi ci torna scrivendo l'indirizzo a mano o da un segnalibro —
    // il tasto "indietro" è già coperto da replaceUrl in confirmBooking().
    try {
      if (await this.lessonsService.findActiveIncontro(profile.id)) {
        this.router.navigateByUrl(RIEPILOGO_URL, { replaceUrl: true });
        return;
      }
    } catch {
      // Se il controllo fallisce si mostra comunque il calendario: il vincolo
      // vero (un solo Incontro attivo) resta nel database, book_lesson
      // rifiuterebbe una seconda prenotazione con un messaggio chiaro.
    }

    await this.loadSlots();
  }

  async loadSlots(): Promise<void> {
    this.loadingSlots.set(true);
    this.errorMessage.set(null);
    try {
      const [slots, settings] = await Promise.all([
        this.slotsService.listAvailable(),
        this.lessonsService.getBookingSettings(),
      ]);
      this.bookingMinHours.set(settings.bookingMinHoursBefore);
      this.slots.set(slots.filter((s) => this.isBookableNow(s, settings.bookingMinHoursBefore)));
    } catch {
      this.errorMessage.set('Errore nel caricamento degli orari disponibili.');
    } finally {
      this.loadingSlots.set(false);
    }
  }

  private isBookableNow(slot: SlotRow, minHoursBefore: number): boolean {
    const slotStart = new Date(`${slot.date}T${slot.time_from}`);
    const threshold = new Date(Date.now() + minHoursBefore * 60 * 60 * 1000);
    return slotStart >= threshold;
  }

  openBooking(slot: SlotRow): void {
    this.dialogSlot.set(slot);
    this.dialogError.set(null);
    this.errorMessage.set(null);
  }

  closeDialog(): void {
    this.dialogSlot.set(null);
    this.dialogError.set(null);
  }

  async confirmBooking(): Promise<void> {
    const slot = this.dialogSlot();
    if (!slot) {
      return;
    }

    this.bookingId.set(slot.id);
    this.dialogError.set(null);
    try {
      await this.bookingService.bookLesson(slot.id);
    } catch (err) {
      const message = (err as { message?: string } | null)?.message;
      this.dialogError.set(message || 'Richiesta non riuscita.');
      this.bookingId.set(null);
      return;
    }

    // replaceUrl: la pagina di prenotazione esce dalla cronologia, il tasto
    // "indietro" dal riepilogo non ci riporta qui.
    this.router.navigateByUrl(RIEPILOGO_URL, { replaceUrl: true });
  }
}
