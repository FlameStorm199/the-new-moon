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

export type CancelDialogState = 'confirm' | 'success';

/**
 * Come il modale di prenotazione: un solo pannello per la richiesta e per la
 * ricevuta, invece di una conferma seguita da un avviso di esito.
 *
 * Serve sia il cliente che disdice la propria lezione sia lo staff che ne
 * cancella una per conto altrui: a quest'ultimo (withReason) compare il
 * campo della motivazione, che finisce nell'email al cliente.
 */
@Component({
  selector: 'app-cancel-lesson-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cancel-lesson-dialog.component.html',
  styleUrl: './cancel-lesson-dialog.component.scss',
})
export class CancelLessonDialogComponent implements AfterViewInit {
  @Input({ required: true }) lesson!: LessonRow;
  @Input() state: CancelDialogState = 'confirm';
  @Input() busy = false;
  @Input() errorMessage: string | null = null;

  /** true per lo staff: mostra il campo della motivazione. */
  @Input() withReason = false;

  /** Nome del cliente, mostrato quando a cancellare è lo staff. */
  @Input() customerLabel: string | null = null;

  /** Emette la motivazione digitata (stringa vuota se non compilata). */
  @Output() readonly confirmed = new EventEmitter<string>();
  @Output() readonly closed = new EventEmitter<void>();

  @ViewChild('primaryAction') private primaryAction?: ElementRef<HTMLElement>;
  @ViewChild('reasonInput') private reasonInput?: ElementRef<HTMLInputElement>;

  ngAfterViewInit(): void {
    // Il focus entra nel pannello, così tastiera e lettori di schermo non
    // restano indietro sulla pagina sotto. Con il campo motivazione il
    // focus va lì: è la prima cosa da fare, non il bottone.
    (this.reasonInput ?? this.primaryAction)?.nativeElement.focus();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.busy) {
      this.closed.emit();
    }
  }

  /** Chiude toccando fuori dal pannello, ma non durante la chiamata. */
  onBackdropClick(): void {
    if (!this.busy) {
      this.closed.emit();
    }
  }

  confirm(): void {
    this.confirmed.emit(this.reasonInput?.nativeElement.value ?? '');
  }

  get dateLabel(): string {
    return formatLongDate(this.lesson.date);
  }

  get timeLabel(): string {
    return formatTimeRange(this.lesson.time_from, this.lesson.time_to);
  }
}
