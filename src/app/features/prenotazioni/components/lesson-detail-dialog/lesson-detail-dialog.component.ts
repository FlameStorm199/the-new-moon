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

/**
 * Dettaglio in sola lettura di una lezione prenotata, aperto cliccando uno
 * slot occupato nel calendario staff. Non parla da sé col server: "Sposta" e
 * "Cancella lezione" chiudono questo pannello ed emettono una richiesta,
 * lasciando a chi lo usa aprire i modali già esistenti (move/cancel), che
 * restano l'unico punto che tocca davvero la lezione.
 *
 * Chiusura con la X in alto a destra, non con un bottone in fondo come gli
 * altri modali della sezione: qui non c'è nulla da confermare, solo
 * un'informazione da consultare — la X comunica meglio "esci quando vuoi".
 */
@Component({
  selector: 'app-lesson-detail-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './lesson-detail-dialog.component.html',
  styleUrl: './lesson-detail-dialog.component.scss',
})
export class LessonDetailDialogComponent implements AfterViewInit {
  @Input({ required: true }) lesson!: LessonRow;

  /** false per l'assistente: vede il dettaglio ma niente azioni, come nelle altre pagine staff. */
  @Input() canAct = true;

  @Output() readonly closed = new EventEmitter<void>();
  @Output() readonly moveRequested = new EventEmitter<void>();
  @Output() readonly cancelRequested = new EventEmitter<void>();

  @ViewChild('closeButton') private closeButton?: ElementRef<HTMLElement>;

  ngAfterViewInit(): void {
    this.closeButton?.nativeElement.focus();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closed.emit();
  }

  onBackdropClick(): void {
    this.closed.emit();
  }

  get customerLabel(): string {
    return `${this.lesson.customer_name} ${this.lesson.customer_surname}`;
  }

  get dateLabel(): string {
    return formatLongDate(this.lesson.date);
  }

  get timeLabel(): string {
    return formatTimeRange(this.lesson.time_from, this.lesson.time_to);
  }
}
