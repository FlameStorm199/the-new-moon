import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LESSON_STATUS_LABELS,
  LessonRow,
  LessonsService,
} from '../../../../core/lessons/lessons.service';
import { UserProfile, UserProfileService } from '../../../../core/users/user-profile.service';
import {
  CancelDialogState,
  CancelLessonDialogComponent,
} from '../../components/cancel-lesson-dialog/cancel-lesson-dialog.component';
import { BackLinkComponent } from '../../components/back-link/back-link.component';
import { formatShortDate } from '../../components/date-format';

@Component({
  selector: 'app-le-mie-lezioni',
  standalone: true,
  imports: [CommonModule, RouterLink, CancelLessonDialogComponent, BackLinkComponent],
  templateUrl: './le-mie-lezioni.component.html',
  styleUrl: './le-mie-lezioni.component.scss',
})
export class LeMieLezioniComponent implements OnInit {
  private readonly lessonsService = inject(LessonsService);
  private readonly profileService = inject(UserProfileService);

  readonly formatDate = formatShortDate;

  readonly profile = signal<UserProfile | null>(null);
  readonly lessons = signal<LessonRow[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly cancellingId = signal<number | null>(null);

  /** Lezione su cui è aperto il modale: prima conferma, poi ricevuta. */
  readonly dialogLesson = signal<LessonRow | null>(null);
  readonly dialogState = signal<CancelDialogState>('confirm');
  readonly dialogError = signal<string | null>(null);

  readonly cancelMinHours = signal<number | null>(null);
  readonly statusLabels = LESSON_STATUS_LABELS;

  /** Lezioni ancora da fare: non cancellate e non ancora iniziate. */
  readonly upcoming = computed(() =>
    this.lessons()
      .filter((l) => this.isActive(l) && this.startOf(l).getTime() > Date.now())
      .reverse()
  );

  /** Tutto il resto: svolte, cancellate, rifiutate. */
  readonly history = computed(() =>
    this.lessons().filter((l) => !(this.isActive(l) && this.startOf(l).getTime() > Date.now()))
  );

  get canUsePlatform(): boolean {
    const p = this.profile();
    return !!p && (p.validated || p.typeCode === 'trainer' || p.typeCode === 'admin');
  }

  async ngOnInit(): Promise<void> {
    const profile = await this.profileService.getMyProfile();
    this.profile.set(profile);

    if (!profile || !this.canUsePlatform) {
      this.loading.set(false);
      return;
    }

    try {
      const [lessons, settings] = await Promise.all([
        this.lessonsService.listForCustomer(profile.id),
        this.lessonsService.getBookingSettings(),
      ]);
      this.lessons.set(lessons);
      this.cancelMinHours.set(settings.cancelMinHoursBefore);
    } catch {
      this.errorMessage.set('Errore nel caricamento delle lezioni.');
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Solo per decidere cosa mostrare: la finestra di cancellazione vera è
   * verificata dalla RPC, che è l'unica a poter dire di no.
   */
  canCancel(lesson: LessonRow): boolean {
    const minHours = this.cancelMinHours();
    if (minHours === null) {
      return true;
    }
    return this.startOf(lesson).getTime() - Date.now() >= minHours * 3600_000;
  }

  /** Il clic non cancella: apre la richiesta di conferma. */
  openCancel(lesson: LessonRow): void {
    this.dialogLesson.set(lesson);
    this.dialogState.set('confirm');
    this.dialogError.set(null);
    this.errorMessage.set(null);
  }

  closeDialog(): void {
    this.dialogLesson.set(null);
    this.dialogError.set(null);
  }

  async confirmCancel(): Promise<void> {
    const lesson = this.dialogLesson();
    if (!lesson) {
      return;
    }

    this.cancellingId.set(lesson.id);
    this.dialogError.set(null);
    try {
      await this.lessonsService.cancel(lesson.id);
      this.lessons.update((list) =>
        list.map((l) => (l.id === lesson.id ? { ...l, status: 'cancelled' as const } : l))
      );
      // Il pannello resta aperto e cambia stato: una sola finestra da
      // chiudere invece di conferma più avviso di esito.
      this.dialogState.set('success');
    } catch (err) {
      const message = (err as { message?: string } | null)?.message;
      this.dialogError.set(message || 'Cancellazione non riuscita.');
    } finally {
      this.cancellingId.set(null);
    }
  }

  private isActive(lesson: LessonRow): boolean {
    return lesson.status === 'confirmed' || lesson.status === 'pending';
  }

  private startOf(lesson: LessonRow): Date {
    return new Date(`${lesson.date}T${lesson.time_from}`);
  }
}
