import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BookingService } from '../../../../core/lessons/booking.service';
import { LessonsService } from '../../../../core/lessons/lessons.service';
import { SlotRow, SlotsService } from '../../../../core/slots/slots.service';
import { UserProfile, UserProfileService } from '../../../../core/users/user-profile.service';
import {
  BookingDialogComponent,
  BookingDialogState,
} from '../../components/booking-dialog/booking-dialog.component';
import { WeekCalendarComponent } from '../../components/week-calendar/week-calendar.component';
import { BackLinkComponent } from '../../components/back-link/back-link.component';

@Component({
  selector: 'app-prenota',
  standalone: true,
  imports: [CommonModule, RouterLink, WeekCalendarComponent, BookingDialogComponent, BackLinkComponent],
  templateUrl: './prenota.component.html',
  styleUrl: './prenota.component.scss',
})
export class PrenotaComponent implements OnInit {
  private readonly slotsService = inject(SlotsService);
  private readonly bookingService = inject(BookingService);
  private readonly profileService = inject(UserProfileService);
  private readonly lessonsService = inject(LessonsService);

  /** null finché non caricata: valore vero letto dal DB (getBookingSettings). */
  readonly bookingMinHours = signal<number | null>(null);

  readonly profile = signal<UserProfile | null>(null);
  readonly loadingProfile = signal(true);
  readonly slots = signal<SlotRow[]>([]);
  readonly loadingSlots = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly bookingId = signal<number | null>(null);

  /**
   * Slot su cui è aperto il modale. Uno solo per entrambi i momenti: prima
   * chiede conferma, poi diventa la ricevuta — senza chiudersi in mezzo.
   */
  readonly dialogSlot = signal<SlotRow | null>(null);
  readonly dialogState = signal<BookingDialogState>('confirm');
  /** Errori della prenotazione: vanno mostrati dove l'utente sta guardando. */
  readonly dialogError = signal<string | null>(null);

  /**
   * Slot che il calendario deve contrassegnare: solo per lo staff, quelli
   * dentro la finestra in cui un cliente non potrebbe prenotare.
   */
  readonly flaggedSlotIds = computed(() =>
    this.slots()
      .filter((slot) => this.isOutsideCustomerWindow(slot))
      .map((slot) => slot.id)
  );

  get canBook(): boolean {
    const p = this.profile();
    if (!p) {
      return false;
    }
    return p.validated || p.typeCode === 'trainer' || p.typeCode === 'admin';
  }

  get isStaff(): boolean {
    const type = this.profile()?.typeCode;
    return type === 'trainer' || type === 'admin';
  }

  async ngOnInit(): Promise<void> {
    this.profile.set(await this.profileService.getMyProfile());
    this.loadingProfile.set(false);
    if (this.canBook) {
      await this.loadSlots();
    }
  }

  async loadSlots(): Promise<void> {
    this.loadingSlots.set(true);
    this.errorMessage.set(null);
    try {
      const [slots, settings] = await Promise.all([
        this.slotsService.listAvailable(14),
        this.lessonsService.getBookingSettings(),
      ]);
      this.bookingMinHours.set(settings.bookingMinHoursBefore);
      // Lo staff bypassa la finestra minima anche lato server (book_lesson):
      // qui è lo stesso, non ha senso nascondergli slot che può comunque
      // prenotare. Per un customer invece uno slot dentro la finestra non
      // deve nemmeno comparire come opzione, non solo essere rifiutato al
      // click: coerente con la stessa regola già enforced in book_lesson.
      this.slots.set(
        this.isStaff
          ? slots
          : slots.filter((s) => this.isBookableNow(s, settings.bookingMinHoursBefore))
      );
    } catch {
      this.errorMessage.set('Errore nel caricamento degli slot disponibili.');
    } finally {
      this.loadingSlots.set(false);
    }
  }

  /**
   * Stessa soglia di book_lesson lato DB (booking_min_hours_before), qui
   * solo per non mostrare come opzione uno slot che verrebbe comunque
   * rifiutato al momento della prenotazione. Il controllo che conta resta
   * quello server-side: questo è solo UX.
   */
  private isBookableNow(slot: SlotRow, minHoursBefore: number): boolean {
    const slotStart = new Date(`${slot.date}T${slot.time_from}`);
    const threshold = new Date(Date.now() + minHoursBefore * 60 * 60 * 1000);
    return slotStart >= threshold;
  }

  /**
   * Solo per lo staff: gli slot dentro la finestra minima restano
   * prenotabili (è una deroga voluta, per chi telefona all'ultimo), ma vanno
   * segnalati — altrimenti sembra che la regola delle N ore non funzioni,
   * mentre semplicemente non si applica a chi sta guardando.
   */
  isOutsideCustomerWindow(slot: SlotRow): boolean {
    const minHours = this.bookingMinHours();
    if (minHours === null || !this.isStaff) {
      return false;
    }
    return !this.isBookableNow(slot, minHours);
  }

  /** Il clic sul calendario non prenota: apre la richiesta di conferma. */
  openBooking(slot: SlotRow): void {
    this.dialogSlot.set(slot);
    this.dialogState.set('confirm');
    this.dialogError.set(null);
    this.errorMessage.set(null);
  }

  closeDialog(): void {
    this.dialogSlot.set(null);
    this.dialogError.set(null);
  }

  async confirmBooking(note: string): Promise<void> {
    const slot = this.dialogSlot();
    if (!slot) {
      return;
    }

    this.bookingId.set(slot.id);
    this.dialogError.set(null);
    try {
      await this.bookingService.bookLesson(slot.id, note);
      this.slots.update((list) => list.filter((s) => s.id !== slot.id));
      // Il pannello resta aperto e cambia stato: una sola finestra da
      // chiudere invece di conferma più avviso di esito.
      this.dialogState.set('success');
    } catch (err) {
      // Non "err instanceof Error": senza throwOnError() supabase-js
      // restituisce l'errore RPC come oggetto semplice (il JSON di
      // PostgREST), non come istanza di Error — quel controllo falliva
      // sempre e nascondeva il messaggio vero (es. il limite di una lezione
      // a settimana) dietro il generico "Prenotazione non riuscita".
      const message = (err as { message?: string } | null)?.message;
      this.dialogError.set(message || 'Prenotazione non riuscita.');
    } finally {
      this.bookingId.set(null);
    }
  }
}
