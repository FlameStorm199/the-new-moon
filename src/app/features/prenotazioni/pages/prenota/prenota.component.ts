import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EventRow, EventsService } from '../../../../core/events/events.service';
import { EventRegistrationsService } from '../../../../core/events/event-registrations.service';
import { BookingService } from '../../../../core/lessons/booking.service';
import { LESSON_STATUS_LABELS, LessonRow, LessonsService } from '../../../../core/lessons/lessons.service';
import { SlotRow, SlotsService } from '../../../../core/slots/slots.service';
import { UserProfile, UserProfileService } from '../../../../core/users/user-profile.service';
import {
  BookingDialogComponent,
  BookingDialogState,
} from '../../components/booking-dialog/booking-dialog.component';
import {
  EventDetailDialogComponent,
  EventDetailDialogState,
} from '../../components/event-detail-dialog/event-detail-dialog.component';
import { WeekCalendarComponent } from '../../components/week-calendar/week-calendar.component';
import { BackLinkComponent } from '../../components/back-link/back-link.component';
import { formatLongDate, formatTimeRange } from '../../components/date-format';

@Component({
  selector: 'app-prenota',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    WeekCalendarComponent,
    BookingDialogComponent,
    EventDetailDialogComponent,
    BackLinkComponent,
  ],
  templateUrl: './prenota.component.html',
  styleUrl: './prenota.component.scss',
})
export class PrenotaComponent implements OnInit {
  private readonly slotsService = inject(SlotsService);
  private readonly bookingService = inject(BookingService);
  private readonly profileService = inject(UserProfileService);
  private readonly lessonsService = inject(LessonsService);
  private readonly eventsService = inject(EventsService);
  private readonly registrationsService = inject(EventRegistrationsService);

  /** null finché non caricata: valore vero letto dal DB (getBookingSettings). */
  readonly bookingMinHours = signal<number | null>(null);

  readonly profile = signal<UserProfile | null>(null);
  readonly loadingProfile = signal(true);
  readonly slots = signal<SlotRow[]>([]);
  readonly loadingSlots = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly bookingId = signal<number | null>(null);

  /**
   * Le proprie lezioni ancora da fare: mostrate sopra il calendario, così il
   * limite di una a settimana non si scopre solo dall'errore dopo il click.
   */
  readonly myUpcoming = signal<LessonRow[]>([]);
  readonly formatLongDate = formatLongDate;
  readonly formatTimeRange = formatTimeRange;
  readonly statusLabels = LESSON_STATUS_LABELS;

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

  /**
   * Eventi nel calendario accanto agli slot, per chi può iscriversi: stessa
   * lista e stesse RPC della pagina Eventi, qui solo un secondo ingresso.
   */
  readonly events = signal<EventRow[]>([]);
  readonly dialogEvent = signal<EventRow | null>(null);
  readonly eventDialogState = signal<EventDetailDialogState>('view');
  readonly eventBusy = signal(false);
  readonly eventError = signal<string | null>(null);

  /**
   * Lezioni in programma ed eventi a cui si è iscritti, in un'unica lista
   * per data: è quello che il cliente ha già in agenda.
   */
  readonly upcomingItems = computed(() => {
    const lessons = this.myUpcoming().map((l) => ({
      key: `l${l.id}`,
      kind: 'lesson' as const,
      date: l.date,
      timeFrom: l.time_from,
      timeTo: l.time_to,
      title: null as string | null,
      status: l.status,
    }));
    const events = this.events()
      .filter((e) => e.my_registration_id !== null)
      .map((e) => ({
        key: `e${e.id}`,
        kind: 'event' as const,
        date: e.date,
        timeFrom: e.time_from,
        timeTo: e.time_to,
        title: e.title as string | null,
        status: null,
      }));
    return [...lessons, ...events].sort((a, b) =>
      `${a.date}T${a.timeFrom}`.localeCompare(`${b.date}T${b.timeFrom}`)
    );
  });

  /** Etichetta sugli slot segnalati, con la soglia vera letta dal DB. */
  readonly flaggedLabel = computed(() => {
    const minHours = this.bookingMinHours();
    return minHours === null ? '< finestra' : `< ${minHours}h`;
  });

  /**
   * Un assistente può prenotare per sé esattamente come un customer
   * validato (vedi database/23_assistant_self_booking.sql: book_lesson lo
   * accetta ormai come un customer, solo senza il controllo di validazione
   * che non lo riguarda). Non può però prenotare per conto di altri: quello
   * resta riservato a isStaff (trainer/admin), sotto.
   *
   * future_customer (Fase 2, vedi handoff_fase2.md): stesso motivo —
   * "validated" è un timbro che lo staff mette DOPO l'Incontro Conoscitivo,
   * richiederlo PRIMA per prenotare proprio quell'incontro sarebbe un
   * blocco permanente, non temporaneo. book_lesson/cancel_lesson lato DB
   * vanno ancora aggiornati per accettare questo ruolo (giorno 4): fino ad
   * allora questa pagina mostra il calendario ma la prenotazione vera fallisce
   * lato server con "Ruolo non autorizzato" — comportamento sicuro (nessuna
   * riga scritta con dati sbagliati), solo non ancora funzionante end-to-end.
   */
  get canBook(): boolean {
    const p = this.profile();
    if (!p) {
      return false;
    }
    return (
      p.validated ||
      p.typeCode === 'trainer' ||
      p.typeCode === 'admin' ||
      p.typeCode === 'assistant' ||
      p.typeCode === 'future_customer'
    );
  }

  /**
   * Solo trainer/admin: sono gli unici a vedere anche gli slot dentro la
   * finestra minima e a poter prenotare lì dentro. Un assistente, come un
   * customer, la finestra la rispetta (stesso vincolo lato RPC).
   */
  get isStaff(): boolean {
    const type = this.profile()?.typeCode;
    return type === 'trainer' || type === 'admin';
  }

  /**
   * Un assistente ormai può prenotare (vedi canBook sopra) quindi questo
   * conta solo per un vero cliente non validato: "aspetta la validazione"
   * ha senso solo per customer/future_customer, per un assistente sarebbe
   * falso (canBook è già true per lui).
   */
  get isCustomerType(): boolean {
    const type = this.profile()?.typeCode;
    return type === 'customer' || type === 'future_customer';
  }

  /**
   * Stessi ruoli della pagina Eventi, meno future_customer: lui non arriva
   * qui ma alla prenotazione dell'incontro conoscitivo.
   */
  get canRegisterEvents(): boolean {
    const type = this.profile()?.typeCode;
    return type === 'customer' || type === 'assistant';
  }

  async ngOnInit(): Promise<void> {
    this.profile.set(await this.profileService.getMyProfile());
    this.loadingProfile.set(false);
    if (this.canBook) {
      await this.loadSlots();
    }
  }

  private async loadMyUpcoming(): Promise<void> {
    const p = this.profile();
    // Lo staff qui prenota per sé solo di rado e non ha il limite
    // settimanale: la striscia servirebbe a poco.
    if (!p || this.isStaff) {
      return;
    }
    try {
      const now = Date.now();
      this.myUpcoming.set(
        (await this.lessonsService.listForCustomer(p.id))
          .filter((l) => l.status === 'pending' || l.status === 'confirmed')
          .filter((l) => new Date(`${l.date}T${l.time_from}`).getTime() > now)
          .sort((a, b) => `${a.date}T${a.time_from}`.localeCompare(`${b.date}T${b.time_from}`))
      );
    } catch {
      // Solo informativo: se non si carica, il calendario funziona lo stesso.
      this.myUpcoming.set([]);
    }
  }

  private async loadEvents(): Promise<void> {
    if (!this.canRegisterEvents) {
      return;
    }
    try {
      this.events.set(await this.eventsService.listUpcoming());
    } catch {
      // Gli eventi sono un di più su questa pagina: se non si caricano, le
      // lezioni restano prenotabili.
      this.events.set([]);
    }
  }

  async loadSlots(): Promise<void> {
    this.loadingSlots.set(true);
    this.errorMessage.set(null);
    try {
      const [slots, settings] = await Promise.all([
        this.slotsService.listAvailable(),
        this.lessonsService.getBookingSettings(),
        this.loadMyUpcoming(),
        this.loadEvents(),
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
      void this.loadMyUpcoming();
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

  // --- Eventi ---

  openEvent(event: EventRow): void {
    this.dialogEvent.set(event);
    this.eventDialogState.set('view');
    this.eventError.set(null);
  }

  closeEventDialog(): void {
    this.dialogEvent.set(null);
    this.eventError.set(null);
  }

  async registerEvent(): Promise<void> {
    const event = this.dialogEvent();
    if (!event) return;

    this.eventBusy.set(true);
    this.eventError.set(null);
    try {
      await this.registrationsService.register(event.id);
      await this.refreshDialogEvent(event.id);
      this.eventDialogState.set('registered');
    } catch (err) {
      const message = (err as { message?: string } | null)?.message;
      this.eventError.set(message || 'Iscrizione non riuscita.');
    } finally {
      this.eventBusy.set(false);
    }
  }

  async cancelEventRegistration(): Promise<void> {
    const event = this.dialogEvent();
    if (!event?.my_registration_id) return;

    this.eventBusy.set(true);
    this.eventError.set(null);
    try {
      await this.registrationsService.cancel(event.my_registration_id);
      await this.refreshDialogEvent(event.id);
      this.eventDialogState.set('cancelled');
    } catch (err) {
      const message = (err as { message?: string } | null)?.message;
      this.eventError.set(message || 'Cancellazione non riuscita.');
    } finally {
      this.eventBusy.set(false);
    }
  }

  /**
   * Ricarica gli eventi (posti e propria iscrizione cambiano) e aggiorna
   * quello nel modale, che altrimenti mostrerebbe ancora lo stato di prima.
   */
  private async refreshDialogEvent(eventId: number): Promise<void> {
    await this.loadEvents();
    const fresh = this.events().find((e) => e.id === eventId);
    if (fresh) {
      this.dialogEvent.set(fresh);
    }
  }
}
