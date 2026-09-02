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
import { RouterLink } from '@angular/router';
import { SlotRow } from '../../../../core/slots/slots.service';

export type BookingDialogState = 'confirm' | 'success';

const WEEKDAYS = [
  'domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato',
];
const MONTHS = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];

/**
 * Un solo pannello per due momenti: prima chiede conferma, poi — senza
 * chiudersi e riaprirsi — diventa la ricevuta della prenotazione.
 *
 * La conferma non è un "sei sicuro?" di cortesia: il cliente ha diritto a
 * una sola lezione a settimana, quindi un tocco sbagliato gli consuma
 * l'unica prenotazione disponibile. È anche il punto in cui la data viene
 * scritta per esteso, cosa che nel blocco del calendario non entra.
 */
@Component({
  selector: 'app-booking-dialog',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './booking-dialog.component.html',
  styleUrl: './booking-dialog.component.scss',
})
export class BookingDialogComponent implements AfterViewInit {
  @Input({ required: true }) slot!: SlotRow;
  @Input() state: BookingDialogState = 'confirm';
  @Input() busy = false;
  @Input() errorMessage: string | null = null;

  @Output() readonly confirmed = new EventEmitter<void>();
  @Output() readonly closed = new EventEmitter<void>();

  @ViewChild('primaryAction') private primaryAction?: ElementRef<HTMLElement>;

  ngAfterViewInit(): void {
    // Il focus entra nel pannello, così tastiera e lettori di schermo non
    // restano indietro sulla pagina sotto.
    this.primaryAction?.nativeElement.focus();
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

  get dateLabel(): string {
    const [year, month, day] = this.slot.date.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
  }

  get timeLabel(): string {
    return `${this.slot.time_from.slice(0, 5)} – ${this.slot.time_to.slice(0, 5)}`;
  }
}
