import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { BookingService } from '../../../../core/lessons/booking.service';
import {
  LESSON_STATUS_LABELS,
  LessonRow,
  LessonsService,
} from '../../../../core/lessons/lessons.service';
import { SlotRow, SlotsService } from '../../../../core/slots/slots.service';
import { CustomerOption, UserProfileService } from '../../../../core/users/user-profile.service';
import {
  CancelDialogState,
  CancelLessonDialogComponent,
} from '../../components/cancel-lesson-dialog/cancel-lesson-dialog.component';

interface DayGroup {
  date: string;
  lessons: LessonRow[];
}

@Component({
  selector: 'app-gestione-lezioni',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, CancelLessonDialogComponent],
  templateUrl: './gestione-lezioni.component.html',
  styleUrl: './gestione-lezioni.component.scss',
})
export class GestioneLezioniComponent implements OnInit {
  private readonly lessonsService = inject(LessonsService);
  private readonly bookingService = inject(BookingService);
  private readonly slotsService = inject(SlotsService);
  private readonly profileService = inject(UserProfileService);

  readonly lessons = signal<LessonRow[]>([]);
  readonly customers = signal<CustomerOption[]>([]);
  readonly freeSlots = signal<SlotRow[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly infoMessage = signal<string | null>(null);
  readonly busyId = signal<number | null>(null);

  /** Lezione per cui è aperto il pannello "sposta su un altro slot". */
  readonly movingLesson = signal<LessonRow | null>(null);

  /** Lezione su cui è aperto il modale: prima conferma, poi ricevuta. */
  readonly cancellingLesson = signal<LessonRow | null>(null);
  readonly cancelDialogState = signal<CancelDialogState>('confirm');
  readonly cancelDialogError = signal<string | null>(null);

  readonly statusLabels = LESSON_STATUS_LABELS;

  readonly groupedByDate = computed<DayGroup[]>(() => {
    const groups = new Map<string, LessonRow[]>();
    for (const lesson of this.lessons()) {
      const list = groups.get(lesson.date) ?? [];
      list.push(lesson);
      groups.set(lesson.date, list);
    }
    return Array.from(groups.entries()).map(([date, lessons]) => ({ date, lessons }));
  });

  readonly form = new FormGroup({
    customerId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    slotId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    bypassWeeklyLimit: new FormControl(false, { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
  });
  readonly creating = signal(false);

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

  slotLabel(slot: SlotRow): string {
    return `${slot.date} ${slot.time_from.slice(0, 5)}-${slot.time_to.slice(0, 5)}`;
  }

  startMove(lesson: LessonRow): void {
    this.movingLesson.set(this.movingLesson()?.id === lesson.id ? null : lesson);
  }

  async confirmMove(lesson: LessonRow, slotId: string, bypass: boolean): Promise<void> {
    if (!slotId) {
      this.errorMessage.set('Scegli lo slot di destinazione.');
      return;
    }
    await this.run(lesson.id, () =>
      this.lessonsService.moveToSlot(lesson.id, Number(slotId), bypass)
    );
    this.movingLesson.set(null);
  }

  /** Il clic non cancella: apre la richiesta di conferma. */
  openCancel(lesson: LessonRow): void {
    this.cancellingLesson.set(lesson);
    this.cancelDialogState.set('confirm');
    this.cancelDialogError.set(null);
    this.errorMessage.set(null);
    this.infoMessage.set(null);
  }

  closeCancelDialog(): void {
    this.cancellingLesson.set(null);
    this.cancelDialogError.set(null);
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
      // Il pannello resta aperto e cambia stato: una sola finestra da
      // chiudere invece di conferma più avviso di esito.
      this.cancelDialogState.set('success');
    } catch (err) {
      const message = (err as { message?: string } | null)?.message;
      this.cancelDialogError.set(message || 'Cancellazione non riuscita.');
    } finally {
      this.busyId.set(null);
    }
  }

  async submitNewLesson(): Promise<void> {
    if (this.form.invalid || this.creating()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.creating.set(true);
    await this.run(null, () =>
      this.bookingService.bookLessonForCustomer(
        Number(value.slotId),
        Number(value.customerId),
        value.bypassWeeklyLimit,
        value.description
      )
    );
    this.creating.set(false);
    this.form.patchValue({ slotId: '', description: '', bypassWeeklyLimit: false });
  }

  /**
   * Gli errori delle RPC (slot occupato, limite settimanale, permessi) sono
   * già scritti per un lettore umano: vengono mostrati com'è, senza essere
   * appiattiti su un generico "errore".
   */
  private async run(lessonId: number | null, action: () => Promise<void>): Promise<void> {
    this.busyId.set(lessonId);
    this.errorMessage.set(null);
    this.infoMessage.set(null);
    try {
      await action();
      await this.load();
      this.infoMessage.set('Operazione completata.');
    } catch (err) {
      const message = (err as { message?: string } | null)?.message;
      this.errorMessage.set(message || 'Operazione non riuscita.');
    } finally {
      this.busyId.set(null);
    }
  }
}
