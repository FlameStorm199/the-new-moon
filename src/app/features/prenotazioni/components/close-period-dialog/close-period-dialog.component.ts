import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

export type ClosePeriodDialogState = 'form' | 'success';
export type ClosePeriodScope = 'giornata' | 'mattina' | 'pomeriggio';

export interface ClosePeriodFormValue {
  dateFrom: string;
  dateTo: string;
  scope: ClosePeriodScope;
  /** true = riapri, false = tieni libero. */
  active: boolean;
}

/**
 * "Chiudi o riapri un periodo", spostato dalla pagina in un modale: a
 * differenza degli altri, qui non c'è una sola azione da confermare ma due
 * alternative equivalenti (tenere libero o riaprire) sullo stesso intervallo
 * — restano quindi due bottoni nella stessa forma, non un solo "conferma".
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

  submit(active: boolean): void {
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
      active,
    });
  }
}
