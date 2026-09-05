import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild } from '@angular/core';
import { LessonRow } from '../../../../core/lessons/lessons.service';
import { SlotRow } from '../../../../core/slots/slots.service';
import { formatLongDate, formatShortDate, formatTimeRange } from '../date-format';

export type MoveLessonDialogState = 'form' | 'success';

export interface MoveLessonFormValue {
  slotId: number;
  bypassWeeklyLimit: boolean;
}

/**
 * Sposta una lezione su un altro slot. Prima era un pannello che si apriva
 * dentro la riga della lezione, spingendo tutto il resto in basso — ora è un
 * modale, come cancellazione e nuova prenotazione: stesso posto, stesso
 * comportamento, non più uno diverso da ricordare.
 */
@Component({
  selector: 'app-move-lesson-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './move-lesson-dialog.component.html',
  styleUrl: './move-lesson-dialog.component.scss',
})
export class MoveLessonDialogComponent implements AfterViewInit {
  @Input({ required: true }) lesson!: LessonRow;
  @Input({ required: true }) freeSlots: SlotRow[] = [];
  @Input() state: MoveLessonDialogState = 'form';
  @Input() busy = false;
  @Input() errorMessage: string | null = null;
  /** Slot scelto, mostrato nello stato di ricevuta. */
  @Input() movedToSlotLabel: string | null = null;

  @Output() readonly submitted = new EventEmitter<MoveLessonFormValue>();
  @Output() readonly closed = new EventEmitter<void>();

  @ViewChild('firstField') private firstField?: ElementRef<HTMLSelectElement>;
  @ViewChild('primaryAction') private primaryAction?: ElementRef<HTMLElement>;
  @ViewChild('destSelect') private destSelect?: ElementRef<HTMLSelectElement>;
  @ViewChild('bypassCheckbox') private bypassCheckbox?: ElementRef<HTMLInputElement>;

  /** Validazione locale (slot non scelto): distinta da errorMessage, che
   * viene dal server e non va persa se l'utente riprova senza scegliere. */
  localError: string | null = null;

  get displayError(): string | null {
    return this.localError ?? this.errorMessage;
  }

  ngAfterViewInit(): void {
    (this.firstField ?? this.primaryAction)?.nativeElement.focus();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.busy) {
      this.closed.emit();
    }
  }

  onBackdropClick(): void {
    if (!this.busy) {
      this.closed.emit();
    }
  }

  get customerLabel(): string {
    const dog = this.lesson.customer_dog_name ? ` (${this.lesson.customer_dog_name})` : '';
    return `${this.lesson.customer_name} ${this.lesson.customer_surname}${dog}`;
  }

  get dateLabel(): string {
    return formatLongDate(this.lesson.date);
  }

  get timeLabel(): string {
    return formatTimeRange(this.lesson.time_from, this.lesson.time_to);
  }

  slotLabel(slot: SlotRow): string {
    return `${formatShortDate(slot.date)} ${slot.time_from.slice(0, 5)}–${slot.time_to.slice(0, 5)}`;
  }

  submit(): void {
    const slotId = this.destSelect?.nativeElement.value;
    if (!slotId) {
      this.localError = 'Scegli lo slot di destinazione.';
      return;
    }
    this.localError = null;
    this.submitted.emit({
      slotId: Number(slotId),
      bypassWeeklyLimit: this.bypassCheckbox?.nativeElement.checked ?? false,
    });
  }
}
