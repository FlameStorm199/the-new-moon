import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { BookingService } from '../../../../core/lessons/booking.service';
import {
  LESSON_STATUS_LABELS,
  LessonRow,
  LessonsService,
} from '../../../../core/lessons/lessons.service';
import { SlotRow, SlotsService } from '../../../../core/slots/slots.service';
import { CustomerOption, UserProfileService } from '../../../../core/users/user-profile.service';
import { BackLinkComponent } from '../../components/back-link/back-link.component';
import {
  CancelDialogState,
  CancelLessonDialogComponent,
} from '../../components/cancel-lesson-dialog/cancel-lesson-dialog.component';
import { formatLongDate, formatShortDate, todayIso } from '../../components/date-format';
import {
  MoveLessonDialogComponent,
  MoveLessonDialogState,
  MoveLessonFormValue,
} from '../../components/move-lesson-dialog/move-lesson-dialog.component';
import {
  NewLessonDialogComponent,
  NewLessonDialogState,
  NewLessonFormValue,
  NewLessonSummary,
} from '../../components/new-lesson-dialog/new-lesson-dialog.component';

interface DayGroup {
  date: string;
  lessons: LessonRow[];
}

const ACTIVE_STATUSES = new Set(['pending', 'confirmed']);

@Component({
  selector: 'app-gestione-lezioni',
  standalone: true,
  imports: [
    CommonModule,
    BackLinkComponent,
    NewLessonDialogComponent,
    MoveLessonDialogComponent,
    CancelLessonDialogComponent,
  ],
  templateUrl: './gestione-lezioni.component.html',
  styleUrl: './gestione-lezioni.component.scss',
})
export class GestioneLezioniComponent implements OnInit {
  private readonly lessonsService = inject(LessonsService);
  private readonly bookingService = inject(BookingService);
  private readonly slotsService = inject(SlotsService);
  private readonly profileService = inject(UserProfileService);

  /** Intestazione di ogni giornata: per esteso, più leggibile di un DD/MM/YYYY in un titolo. */
  readonly formatDayHeader = formatLongDate;
  readonly statusLabels = LESSON_STATUS_LABELS;

  readonly lessons = signal<LessonRow[]>([]);
  readonly customers = signal<CustomerOption[]>([]);
  readonly freeSlots = signal<SlotRow[]>([]);
  readonly loading = signal(true);
  /** Solo per il caricamento iniziale: gli esiti delle azioni li mostra il modale coinvolto. */
  readonly errorMessage = signal<string | null>(null);
  readonly busyId = signal<number | null>(null);

  /** Riga il cui menu "⋯" è aperto: uno solo alla volta. */
  readonly openActionsFor = signal<number | null>(null);

  // --- Modale "Prenota per un cliente" ---
  readonly newLessonOpen = signal(false);
  readonly newLessonState = signal<NewLessonDialogState>('form');
  readonly newLessonBusy = signal(false);
  readonly newLessonError = signal<string | null>(null);
  readonly newLessonSummary = signal<NewLessonSummary | null>(null);

  // --- Modale "Sposta lezione" ---
  readonly movingLesson = signal<LessonRow | null>(null);
  readonly moveDialogState = signal<MoveLessonDialogState>('form');
  readonly moveDialogError = signal<string | null>(null);
  readonly movedToSlotLabel = signal<string | null>(null);

  // --- Modale "Cancella lezione" (prima/dopo, invariato) ---
  readonly cancellingLesson = signal<LessonRow | null>(null);
  readonly cancelDialogState = signal<CancelDialogState>('confirm');
  readonly cancelDialogError = signal<string | null>(null);

  readonly groupedByDate = computed<DayGroup[]>(() => {
    const groups = new Map<string, LessonRow[]>();
    for (const lesson of this.lessons()) {
      const list = groups.get(lesson.date) ?? [];
      list.push(lesson);
      groups.set(lesson.date, list);
    }
    return Array.from(groups.entries()).map(([date, lessons]) => ({ date, lessons }));
  });

  /** Per il riepilogo sotto il titolo: le cancellate/rifiutate non contano. */
  private readonly activeLessons = computed(() =>
    this.lessons().filter((l) => ACTIVE_STATUSES.has(l.status))
  );

  readonly upcomingCount = computed(() => this.activeLessons().length);

  readonly todayCount = computed(() => {
    const today = todayIso();
    return this.activeLessons().filter((l) => l.date === today).length;
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const [lessons, customers, slots] = await Promise.all([
        this.lessonsService.listUpcoming(30),
        this.profileService.listValidatedCustomers(),
        this.slotsService.listAvailable(30),
      ]);
      this.lessons.set(lessons);
      this.customers.set(customers);
      this.freeSlots.set(slots);
    } catch {
      this.errorMessage.set('Errore nel caricamento delle lezioni.');
    } finally {
      this.loading.set(false);
    }
  }

  customerLabel(lesson: LessonRow): string {
    const dog = lesson.customer_dog_name ? ` (${lesson.customer_dog_name})` : '';
    return `${lesson.customer_name} ${lesson.customer_surname}${dog}`;
  }

  isCancellable(lesson: LessonRow): boolean {
    return lesson.status !== 'cancelled' && lesson.status !== 'rejected';
  }

  // --- Menu azioni per riga ---

  toggleActions(lessonId: number, event: Event): void {
    event.stopPropagation();
    this.openActionsFor.set(this.openActionsFor() === lessonId ? null : lessonId);
  }

  /** Un clic ovunque chiude il menu aperto: niente da tenere in giro dopo. */
  @HostListener('document:click')
  onDocumentClick(): void {
    this.openActionsFor.set(null);
  }

  // --- "Prenota per un cliente" ---

  openNewLesson(): void {
    this.openActionsFor.set(null);
    this.newLessonState.set('form');
    this.newLessonError.set(null);
    this.newLessonSummary.set(null);
    this.newLessonOpen.set(true);
  }

  closeNewLessonDialog(): void {
    this.newLessonOpen.set(false);
  }

  async submitNewLesson(value: NewLessonFormValue): Promise<void> {
    // Presi PRIMA della chiamata: dopo il ricaricamento lo slot appena
    // occupato non è più tra i freeSlots, e la ricevuta lo mostrerebbe vuoto.
    const customer = this.customers().find((c) => c.id === value.customerId);
    const slot = this.freeSlots().find((s) => s.id === value.slotId);

    this.newLessonBusy.set(true);
    this.newLessonError.set(null);
    try {
      await this.bookingService.bookLessonForCustomer(
        value.slotId,
        value.customerId,
        value.bypassWeeklyLimit,
        value.description
      );
      this.newLessonSummary.set({
        customerLabel: customer
          ? `${customer.name} ${customer.surname}${customer.dog_name ? ` (${customer.dog_name})` : ''}`
          : 'Cliente',
        slotLabel: slot
          ? `${formatShortDate(slot.date)} ${slot.time_from.slice(0, 5)}–${slot.time_to.slice(0, 5)}`
          : '',
      });
      this.newLessonState.set('success');
      await this.load();
    } catch (err) {
      this.newLessonError.set(errorText(err) ?? 'Prenotazione non riuscita.');
    } finally {
      this.newLessonBusy.set(false);
    }
  }

  // --- "Sposta lezione" ---

  openMove(lesson: LessonRow): void {
    this.openActionsFor.set(null);
    this.movingLesson.set(lesson);
    this.moveDialogState.set('form');
    this.moveDialogError.set(null);
    this.movedToSlotLabel.set(null);
  }

  closeMoveDialog(): void {
    this.movingLesson.set(null);
  }

  async confirmMove(value: MoveLessonFormValue): Promise<void> {
    const lesson = this.movingLesson();
    if (!lesson) {
      return;
    }
    const slot = this.freeSlots().find((s) => s.id === value.slotId);

    this.busyId.set(lesson.id);
    this.moveDialogError.set(null);
    try {
      await this.lessonsService.moveToSlot(lesson.id, value.slotId, value.bypassWeeklyLimit);
      this.movedToSlotLabel.set(
        slot ? `${formatShortDate(slot.date)} ${slot.time_from.slice(0, 5)}–${slot.time_to.slice(0, 5)}` : null
      );
      this.moveDialogState.set('success');
      await this.load();
    } catch (err) {
      this.moveDialogError.set(errorText(err) ?? 'Spostamento non riuscito.');
    } finally {
      this.busyId.set(null);
    }
  }

  // --- "Cancella lezione" ---

  openCancel(lesson: LessonRow): void {
    this.openActionsFor.set(null);
    this.cancellingLesson.set(lesson);
    this.cancelDialogState.set('confirm');
    this.cancelDialogError.set(null);
  }

  closeCancelDialog(): void {
    this.cancellingLesson.set(null);
  }

  /**
   * `reason` è facoltativo: se compilato finisce sulla lezione e nell'email
   * che avvisa il cliente della cancellazione.
   */
  async confirmCancel(reason: string): Promise<void> {
    const lesson = this.cancellingLesson();
    if (!lesson) {
      return;
    }

    this.busyId.set(lesson.id);
    this.cancelDialogError.set(null);
    try {
      await this.lessonsService.cancel(lesson.id, reason);
      await this.load();
      this.cancelDialogState.set('success');
    } catch (err) {
      this.cancelDialogError.set(errorText(err) ?? 'Cancellazione non riuscita.');
    } finally {
      this.busyId.set(null);
    }
  }
}

function errorText(err: unknown): string | null {
  return (err as { message?: string } | null)?.message ?? null;
}
