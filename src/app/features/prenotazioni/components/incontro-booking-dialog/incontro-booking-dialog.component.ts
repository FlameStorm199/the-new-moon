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

export type IncontroBookingDialogState = 'confirm' | 'success';

/**
 * Copia di booking-dialog.component.ts, testo adattato all'Incontro
 * Conoscitivo (richiesta esplicita: "compresi i modali") — componente
 * dedicato invece di parametrizzare quello esistente: questa pagina serve
 * solo future_customer, niente logica di ruolo da mescolarci.
 *
 * Nessun campo nota (a differenza di booking-dialog): non richiesto per
 * l'Incontro Conoscitivo, che non ha un equivalente di "note per
 * l'educatore" nel documento di design.
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
  @Input() state: IncontroBookingDialogState = 'confirm';
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
