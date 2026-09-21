import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  ViewChild,
} from '@angular/core';
import { LessonRow } from '../../../../core/lessons/lessons.service';
import { formatLongDate, formatTimeRange } from '../date-format';

export type RespondIncontroMode = 'accept' | 'reject';
export type RespondIncontroDialogState = 'confirm' | 'success';

/**
 * Accettazione/rifiuto di un Incontro Conoscitivo in attesa (RPC
 * respond_incontro_conoscitivo, database/28_fase2_incontro_conoscitivo_booking.sql).
 * Stesso pattern a due stati di cancel-lesson-dialog (un solo pannello per
 * richiesta e ricevuta), parametrizzato su `mode` invece di duplicare quasi
 * tutto per un secondo componente: le due azioni condividono struttura,
 * cambia solo il testo e se il motivo è obbligatorio (solo per il rifiuto,
 * enforced anche lato RPC).
 */
@Component({
  selector: 'app-respond-incontro-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './respond-incontro-dialog.component.html',
  styleUrl: './respond-incontro-dialog.component.scss',
})
export class RespondIncontroDialogComponent implements AfterViewInit {
  @Input({ required: true }) lesson!: LessonRow;
  @Input({ required: true }) mode!: RespondIncontroMode;
  @Input() state: RespondIncontroDialogState = 'confirm';
  @Input() busy = false;
  @Input() errorMessage: string | null = null;

  /** Motivo del rifiuto (vuoto per l'accettazione, che non lo emette nemmeno). */
  @Output() readonly confirmed = new EventEmitter<string>();
  @Output() readonly closed = new EventEmitter<void>();

  @ViewChild('primaryAction') private primaryAction?: ElementRef<HTMLElement>;
  @ViewChild('reasonInput') private reasonInput?: ElementRef<HTMLInputElement>;

  ngAfterViewInit(): void {
    (this.reasonInput ?? this.primaryAction)?.nativeElement.focus();
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

  confirm(): void {
    this.confirmed.emit(this.reasonInput?.nativeElement.value ?? '');
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
}
