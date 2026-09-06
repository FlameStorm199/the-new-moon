import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, OnInit, Output, inject, signal } from '@angular/core';
import { ClosedDay, ClosedDayScope, SlotsService } from '../../../../core/slots/slots.service';
import { formatLongDate } from '../date-format';

const SCOPE_LABELS: Record<ClosedDayScope, string> = {
  giornata: 'Tutta la giornata',
  mattina: 'Solo mattina',
  pomeriggio: 'Solo pomeriggio',
};

/**
 * Elenco di sola lettura (+ riapertura) di tutte le chiusure registrate,
 * vicine e lontane: creare una chiusura si fa dal modale "Chiudi o riapri
 * un periodo", non più da qui — vedi database/22_unify_period_closures.sql.
 */
@Component({
  selector: 'app-closed-days-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './closed-days-dialog.component.html',
  styleUrl: './closed-days-dialog.component.scss',
})
export class ClosedDaysDialogComponent implements OnInit {
  private readonly slotsService = inject(SlotsService);

  readonly formatDate = formatLongDate;
  readonly scopeLabels = SCOPE_LABELS;

  readonly days = signal<ClosedDay[]>([]);
  readonly loading = signal(true);
  readonly removingKey = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  @Output() readonly closed = new EventEmitter<void>();

  ngOnInit(): void {
    void this.load();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closed.emit();
  }

  onBackdropClick(): void {
    this.closed.emit();
  }

  rowKey(day: ClosedDay): string {
    return `${day.date}:${day.part_of_day}`;
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.days.set(await this.slotsService.listClosedDays());
    } catch {
      this.errorMessage.set('Errore nel caricamento delle chiusure.');
    } finally {
      this.loading.set(false);
    }
  }

  async remove(day: ClosedDay): Promise<void> {
    const key = this.rowKey(day);
    this.removingKey.set(key);
    this.errorMessage.set(null);
    try {
      await this.slotsService.removeClosedDay(day.date, day.part_of_day);
      this.days.update((list) => list.filter((d) => this.rowKey(d) !== key));
    } catch (err) {
      this.errorMessage.set(errorText(err) ?? 'Errore nella riapertura.');
    } finally {
      this.removingKey.set(null);
    }
  }
}

function errorText(err: unknown): string | null {
  return (err as { message?: string } | null)?.message ?? null;
}
