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
import { EventRow, formatEventPrice } from '../../../../core/events/events.service';
import { formatLongDate, formatTimeRange } from '../date-format';

/**
 * 'view': dettagli e azione (iscriviti o cancella). 'registered' e
 * 'cancelled': la ricevuta, nello stesso pannello — come il modale di
 * prenotazione lezione, una sola finestra da chiudere.
 */
export type EventDetailDialogState = 'view' | 'registered' | 'cancelled';

/**
 * Dettaglio di un evento aperto dal calendario di prenotazione, con
 * iscrizione e cancellazione. La cancellazione chiede una conferma dentro lo
 * stesso pannello invece di aprire un secondo modale sopra il primo.
 */
@Component({
  selector: 'app-event-detail-dialog',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './event-detail-dialog.component.html',
  styleUrl: './event-detail-dialog.component.scss',
})
export class EventDetailDialogComponent implements AfterViewInit {
  @Input({ required: true }) event!: EventRow;
  @Input() state: EventDetailDialogState = 'view';
  @Input() busy = false;
  @Input() errorMessage: string | null = null;

  @Output() readonly registerRequested = new EventEmitter<void>();
  @Output() readonly cancelConfirmed = new EventEmitter<void>();
  @Output() readonly closed = new EventEmitter<void>();

  @ViewChild('primaryAction') private primaryAction?: ElementRef<HTMLElement>;

  /** Secondo passo della cancellazione: "sei sicuro?" al posto dei dettagli. */
  askingCancel = false;

  ngAfterViewInit(): void {
    this.primaryAction?.nativeElement.focus();
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

  get registered(): boolean {
    return this.event.my_registration_id !== null;
  }

  get full(): boolean {
    return (
      this.event.max_customers !== null &&
      this.event.active_registrations >= this.event.max_customers
    );
  }

  get dateLabel(): string {
    return formatLongDate(this.event.date);
  }

  get timeLabel(): string {
    return formatTimeRange(this.event.time_from, this.event.time_to);
  }

  get priceLabel(): string | null {
    return this.event.price === null ? null : formatEventPrice(this.event.price);
  }

  get seatsLabel(): string | null {
    if (this.event.max_customers === null) return null;
    const left = Math.max(0, this.event.max_customers - this.event.active_registrations);
    if (left === 0) return 'Posti esauriti';
    return left === 1 ? '1 posto libero' : `${left} posti liberi`;
  }
}
