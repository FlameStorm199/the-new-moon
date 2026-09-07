import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';
import { UserProfile, UserProfileService } from '../../../../core/users/user-profile.service';
import { ClosedDay, SlotRow, SlotsService } from '../../../../core/slots/slots.service';
import { LessonRow, LessonsService } from '../../../../core/lessons/lessons.service';
import { StaffCalendarComponent } from '../../components/staff-calendar/staff-calendar.component';
import { formatShortDate } from '../../components/date-format';
import { LessonDetailDialogComponent } from '../../components/lesson-detail-dialog/lesson-detail-dialog.component';
import {
  MoveLessonDialogComponent,
  MoveLessonDialogState,
  MoveLessonFormValue,
} from '../../components/move-lesson-dialog/move-lesson-dialog.component';
import {
  CancelDialogState,
  CancelLessonDialogComponent,
} from '../../components/cancel-lesson-dialog/cancel-lesson-dialog.component';

/** Stesso orizzonte del calendario: oltre non ha senso caricare dati che non verranno mostrati. */
const HORIZON_DAYS = 30;

@Component({
  selector: 'app-area-personale',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    StaffCalendarComponent,
    LessonDetailDialogComponent,
    MoveLessonDialogComponent,
    CancelLessonDialogComponent,
  ],
  templateUrl: './area-personale.component.html',
  styleUrl: './area-personale.component.scss',
})
export class AreaPersonaleComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly profileService = inject(UserProfileService);
  private readonly slotsService = inject(SlotsService);
  private readonly lessonsService = inject(LessonsService);

  readonly profile = signal<UserProfile | null>(null);
  readonly loadingProfile = signal(true);

  // --- Calendario staff: la vista principale di questa pagina per chi è
  // staff, vedi StaffCalendarComponent. Caricato solo per isStaffViewer, un
  // cliente non ne ha bisogno.
  readonly loadingCalendar = signal(true);
  readonly calendarError = signal<string | null>(null);
  readonly slots = signal<SlotRow[]>([]);
  readonly lessons = signal<LessonRow[]>([]);
  readonly closedDays = signal<ClosedDay[]>([]);
  readonly togglingSlotId = signal<number | null>(null);

  /** Slot su cui aprire "Sposta lezione": liberi, attivi, non quello occupato dalla lezione stessa. */
  readonly freeSlotsForMove = computed(() => this.slots().filter((s) => s.active && !s.occupied));

  // --- Dettaglio lezione (clic su uno slot occupato) ---
  readonly selectedLesson = signal<LessonRow | null>(null);

  // --- Modale "Sposta lezione" ---
  readonly movingLesson = signal<LessonRow | null>(null);
  readonly moveDialogState = signal<MoveLessonDialogState>('form');
  readonly moveDialogError = signal<string | null>(null);
  readonly movedToSlotLabel = signal<string | null>(null);

  // --- Modale "Cancella lezione" ---
  readonly cancellingLesson = signal<LessonRow | null>(null);
  readonly cancelDialogState = signal<CancelDialogState>('confirm');
  readonly cancelDialogError = signal<string | null>(null);

  readonly busyId = signal<number | null>(null);

  /**
   * Solo trainer/admin: sono gli unici col potere di scrittura vero (toggle
   * slot, sposta/cancella la lezione di chiunque, validare utenti…) — usato
   * per gating quelle azioni sul calendario. Prenotare per sé non è più uno
   * di questi: da database/23_assistant_self_booking.sql lo può fare anche
   * l'assistente, vedi canUsePlatform sotto (che infatti usa isStaffViewer,
   * non questo).
   */
  get isStaff(): boolean {
    const type = this.profile()?.typeCode;
    return type === 'trainer' || type === 'admin';
  }

  /**
   * Assistente incluso: vede tutta la sezione Staff (le pagine lì sotto sono
   * ormai in sola lettura per lui, RLS is_staff() — vedi
   * database/21_assistant_read_access.sql), non può solo scriverci. Diversa
   * da isStaff apposta: quella resta stretta a trainer/admin perché governa
   * anche "puoi prenotare una lezione", cosa che un assistente non può fare.
   */
  get isStaffViewer(): boolean {
    const type = this.profile()?.typeCode;
    return type === 'trainer' || type === 'admin' || type === 'assistant';
  }

  /**
   * "validated" ha senso solo per un cliente: lo staff non viene mai
   * validato (in fase di creazione quel campo resta al suo default), quindi
   * senza questa eccezione perderebbe l'"Area assistito" — stesso controllo
   * già usato in prenota.component.ts e le-mie-lezioni.component.ts.
   *
   * isStaffViewer, non isStaff: un assistente ora può prenotare per sé
   * esattamente come trainer/admin (database/23_assistant_self_booking.sql)
   * — è l'unica azione concessa anche a lui, per questo qui conta lo stesso
   * gruppo che vede il calendario, non quello ristretto che può scriverci.
   */
  get canUsePlatform(): boolean {
    const p = this.profile();
    return !!p && (p.validated || this.isStaffViewer);
  }

  get isCustomerType(): boolean {
    const type = this.profile()?.typeCode;
    return type === 'customer' || type === 'future_customer';
  }

  /**
   * Il messaggio "in attesa di validazione" ha senso solo per un vero
   * cliente non ancora validato — per un assistente sarebbe falso (non gli
   * servirà mai, validated non lo riguarda), quindi va tenuto zitto invece
   * che mostrargli un'attesa che non finirà mai.
   */
  get showPendingMessage(): boolean {
    const p = this.profile();
    return !!p && this.isCustomerType && !p.validated;
  }

  async ngOnInit(): Promise<void> {
    this.profile.set(await this.profileService.getMyProfile());
    this.loadingProfile.set(false);
    if (this.isStaffViewer) {
      await this.loadCalendar();
    }
  }

  async loadCalendar(): Promise<void> {
    this.loadingCalendar.set(true);
    this.calendarError.set(null);
    try {
      const [slots, lessons, closedDays] = await Promise.all([
        this.slotsService.listUpcoming(HORIZON_DAYS),
        this.lessonsService.listUpcoming(HORIZON_DAYS),
        this.slotsService.listClosedDays(),
      ]);
      this.slots.set(slots);
      this.lessons.set(lessons);
      this.closedDays.set(closedDays);
    } catch {
      this.calendarError.set('Errore nel caricamento del calendario.');
    } finally {
      this.loadingCalendar.set(false);
    }
  }

  /** Clic su uno slot libero o disattivato: ne inverte l'attivazione (stesso RPC di gestione-slot). */
  async onSlotToggle(slot: SlotRow): Promise<void> {
    this.togglingSlotId.set(slot.id);
    this.calendarError.set(null);
    try {
      await this.slotsService.setActive(slot.id, !slot.active);
      this.slots.update((list) =>
        list.map((s) => (s.id === slot.id ? { ...s, active: !s.active } : s))
      );
    } catch (err) {
      this.calendarError.set(errorText(err) ?? 'Errore nel salvataggio dello slot.');
    } finally {
      this.togglingSlotId.set(null);
    }
  }

  onLessonOpen(lesson: LessonRow): void {
    this.selectedLesson.set(lesson);
  }

  closeLessonDetail(): void {
    this.selectedLesson.set(null);
  }

  customerLabel(lesson: LessonRow): string {
    const dog = lesson.customer_dog_name ? ` (${lesson.customer_dog_name})` : '';
    return `${lesson.customer_name} ${lesson.customer_surname}${dog}`;
  }

  // --- "Sposta lezione", aperta dal dettaglio ---

  requestMove(lesson: LessonRow): void {
    this.selectedLesson.set(null);
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
    const slot = this.freeSlotsForMove().find((s) => s.id === value.slotId);

    this.busyId.set(lesson.id);
    this.moveDialogError.set(null);
    try {
      await this.lessonsService.moveToSlot(lesson.id, value.slotId, value.bypassWeeklyLimit);
      this.movedToSlotLabel.set(
        slot ? `${formatShortDate(slot.date)} ${slot.time_from.slice(0, 5)}–${slot.time_to.slice(0, 5)}` : null
      );
      this.moveDialogState.set('success');
      await this.loadCalendar();
    } catch (err) {
      this.moveDialogError.set(errorText(err) ?? 'Spostamento non riuscito.');
    } finally {
      this.busyId.set(null);
    }
  }

  // --- "Cancella lezione", aperta dal dettaglio ---

  requestCancel(lesson: LessonRow): void {
    this.selectedLesson.set(null);
    this.cancellingLesson.set(lesson);
    this.cancelDialogState.set('confirm');
    this.cancelDialogError.set(null);
  }

  closeCancelDialog(): void {
    this.cancellingLesson.set(null);
  }

  async confirmCancel(reason: string): Promise<void> {
    const lesson = this.cancellingLesson();
    if (!lesson) {
      return;
    }

    this.busyId.set(lesson.id);
    this.cancelDialogError.set(null);
    try {
      await this.lessonsService.cancel(lesson.id, reason);
      await this.loadCalendar();
      this.cancelDialogState.set('success');
    } catch (err) {
      this.cancelDialogError.set(errorText(err) ?? 'Cancellazione non riuscita.');
    } finally {
      this.busyId.set(null);
    }
  }

  async logout(): Promise<void> {
    await this.auth.signOut();
    this.router.navigateByUrl('/prenotazioni/login');
  }
}

function errorText(err: unknown): string | null {
  return (err as { message?: string } | null)?.message ?? null;
}
