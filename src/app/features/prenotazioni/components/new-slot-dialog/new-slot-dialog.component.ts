import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { PartOfDay } from '../../../../core/slots/slots.service';

export type NewSlotDialogState = 'form' | 'success';

export interface NewSlotFormValue {
  date: string;
  partOfDay: PartOfDay;
  timeFrom: string;
  timeTo: string;
}

/**
 * "Aggiungi slot" (fuori fascia, uno alla volta), spostato dalla pagina in
 * un modale — stesso motivo del modale di prenotazione: il form stava fisso
 * in cima, sopra il contenuto vero (la lista).
 */
@Component({
  selector: 'app-new-slot-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './new-slot-dialog.component.html',
  styleUrl: './new-slot-dialog.component.scss',
})
export class NewSlotDialogComponent implements AfterViewInit {
  @Input() state: NewSlotDialogState = 'form';
  @Input() busy = false;
  @Input() errorMessage: string | null = null;
  /** Riepilogo mostrato nello stato di ricevuta ("03/09/2026 09:00–10:00"). */
  @Input() summaryLabel: string | null = null;

  @Output() readonly submitted = new EventEmitter<NewSlotFormValue>();
  @Output() readonly closed = new EventEmitter<void>();

  @ViewChild('firstField') private firstField?: ElementRef<HTMLElement>;
  @ViewChild('primaryAction') private primaryAction?: ElementRef<HTMLElement>;

  readonly form = new FormGroup({
    date: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    partOfDay: new FormControl<PartOfDay>('mattina', { nonNullable: true }),
    timeFrom: new FormControl('09:00', { nonNullable: true, validators: [Validators.required] }),
    timeTo: new FormControl('10:00', { nonNullable: true, validators: [Validators.required] }),
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
    this.submitted.emit(this.form.getRawValue());
  }
}
