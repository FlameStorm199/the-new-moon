import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

export type ClosePeriodDialogState = 'form' | 'success';
export type ClosePeriodScope = 'giornata' | 'mattina' | 'pomeriggio';

export interface ClosePeriodFormValue {
  dateFrom: string;
  dateTo: string;
  scope: ClosePeriodScope;
  reason?: string;
}

/**
 * "Chiudi campo": chiude un intervallo di date, vicino o lontano. Solo
 * andata apposta — riaprire una data già chiusa si fa da "Elenco chiusure"
 * (closed-days-dialog), riga per riga, non da qui: prima conviveva un
 * secondo bottone "Riapri" nella stessa form, ma un intervallo "dal-al" è
 * scomodo per riaprire un giorno preciso in mezzo a tante chiusure diverse,
 * mentre l'elenco le mostra già una per una.
 */
@Component({
  selector: 'app-close-period-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './close-period-dialog.component.html',
  styleUrl: './close-period-dialog.component.scss',
})
export class ClosePeriodDialogComponent implements AfterViewInit {
  @Input() state: ClosePeriodDialogState = 'form';
  @Input() busy = false;
  @Input() errorMessage: string | null = null;
  /** Testo di esito già composto dal genitore (include l'eventuale nota sugli occupati). */
  @Input() resultMessage: string | null = null;

  @Output() readonly submitted = new EventEmitter<ClosePeriodFormValue>();
  @Output() readonly closed = new EventEmitter<void>();

  @ViewChild('firstField') private firstField?: ElementRef<HTMLElement>;
  @ViewChild('primaryAction') private primaryAction?: ElementRef<HTMLElement>;

  /** Validazione locale (date invertite): distinta da errorMessage, che viene dal server. */
  localError: string | null = null;

  get displayError(): string | null {
    return this.localError ?? this.errorMessage;
  }

  readonly form = new FormGroup({
    dateFrom: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    dateTo: new FormControl('', { nonNullable: true }),
    scope: new FormControl<ClosePeriodScope>('giornata', { nonNullable: true }),
    reason: new FormControl('', { nonNullable: true }),
  });

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

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    if (value.dateTo && value.dateTo < value.dateFrom) {
      this.localError = 'La data di fine è precedente a quella di inizio.';
      return;
    }
    this.localError = null;
    this.submitted.emit({
      dateFrom: value.dateFrom,
      dateTo: value.dateTo || value.dateFrom,
      scope: value.scope,
      reason: value.reason || undefined,
    });
  }
}
