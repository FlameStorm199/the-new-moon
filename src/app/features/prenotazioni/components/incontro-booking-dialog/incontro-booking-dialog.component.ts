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
import { SlotRow } from '../../../../core/slots/slots.service';
import { formatLongDate, formatTimeRange } from '../date-format';

/**
 * Conferma della prenotazione dell'Incontro Conoscitivo (testi adattati da
 * booking-dialog.component.ts). Solo la domanda "Confermi?": l'esito non è
 * più una ricevuta dentro il modale ma una pagina a sé
 * (incontro-conoscitivo-richiesta-inviata), così dopo la prenotazione non
 * si resta sulla pagina del calendario.
 */
@Component({
  selector: 'app-incontro-booking-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './incontro-booking-dialog.component.html',
  styleUrl: './incontro-booking-dialog.component.scss',
})
export class IncontroBookingDialogComponent implements AfterViewInit {
  @Input({ required: true }) slot!: SlotRow;
  @Input() busy = false;
  @Input() errorMessage: string | null = null;

  @Output() readonly confirmed = new EventEmitter<void>();
  @Output() readonly closed = new EventEmitter<void>();

  @ViewChild('primaryAction') private primaryAction?: ElementRef<HTMLElement>;

  ngAfterViewInit(): void {
    this.primaryAction?.nativeElement.focus();
  }

  confirm(): void {
    this.confirmed.emit();
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

  get dateLabel(): string {
    return formatLongDate(this.slot.date);
  }

  get timeLabel(): string {
    return formatTimeRange(this.slot.time_from, this.slot.time_to);
  }
}
