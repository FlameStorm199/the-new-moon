import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, OnInit, Output, ViewChild, inject, signal } from '@angular/core';
import { ClosedDay, SlotsService } from '../../../../core/slots/slots.service';
import { formatLongDate } from '../date-format';

/**
 * Giorni di chiusura: a differenza degli altri modali (form → ricevuta), qui
 * il contenuto è un elenco che cambia nel tempo (aggiungi/riapri più volte
 * nella stessa apertura) — gestisce quindi da sé il proprio caricamento
 * invece di ricevere tutto dal genitore come le dialog di sola azione.
 */
@Component({
  selector: 'app-closed-days-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './closed-days-dialog.component.html',
  styleUrl: './closed-days-dialog.component.scss',
})
export class ClosedDaysDialogComponent implements OnInit, AfterViewInit {
  private readonly slotsService = inject(SlotsService);

  readonly formatDate = formatLongDate;

  readonly days = signal<ClosedDay[]>([]);
  readonly loading = signal(true);
  readonly adding = signal(false);
  readonly removingDate = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  /**
   * Chiuso appena aggiunto: torna comodo per il commiato ("richiude subito"
   * il campo motivo dopo l'inserimento, senza dover ricordare cosa c'era).
   */
  @Output() readonly closed = new EventEmitter<void>();

  @ViewChild('dateInput') private dateInput?: ElementRef<HTMLInputElement>;
  @ViewChild('reasonInput') private reasonInput?: ElementRef<HTMLInputElement>;

  ngOnInit(): void {
    void this.load();
  }

  ngAfterViewInit(): void {
    this.dateInput?.nativeElement.focus();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closed.emit();
  }

  onBackdropClick(): void {
    this.closed.emit();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.days.set(await this.slotsService.listClosedDays());
    } catch {
      this.errorMessage.set('Errore nel caricamento dei giorni di chiusura.');
    } finally {
      this.loading.set(false);
    }
  }

  async submitAdd(): Promise<void> {
    const date = this.dateInput?.nativeElement.value;
    if (!date) {
      this.errorMessage.set('Scegli una data.');
      return;
    }

    this.adding.set(true);
    this.errorMessage.set(null);
    try {
      await this.slotsService.addClosedDay(date, this.reasonInput?.nativeElement.value);
      if (this.dateInput) this.dateInput.nativeElement.value = '';
      if (this.reasonInput) this.reasonInput.nativeElement.value = '';
      await this.load();
    } catch (err) {
      this.errorMessage.set(errorText(err) ?? 'Errore nel salvataggio.');
    } finally {
      this.adding.set(false);
    }
  }

  async remove(day: ClosedDay): Promise<void> {
    this.removingDate.set(day.date);
    this.errorMessage.set(null);
    try {
      await this.slotsService.removeClosedDay(day.date);
      this.days.update((list) => list.filter((d) => d.date !== day.date));
    } catch (err) {
      this.errorMessage.set(errorText(err) ?? 'Errore nella riapertura.');
    } finally {
      this.removingDate.set(null);
    }
  }
}

function errorText(err: unknown): string | null {
  return (err as { message?: string } | null)?.message ?? null;
}
