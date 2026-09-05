import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { SlotRow } from '../../../../core/slots/slots.service';
import { CustomerOption } from '../../../../core/users/user-profile.service';
import { formatShortDate } from '../date-format';

export type NewLessonDialogState = 'form' | 'success';

export interface NewLessonFormValue {
  customerId: number;
  slotId: number;
  bypassWeeklyLimit: boolean;
  description?: string;
}

/** Cosa mostrare nello stato di ricevuta, dopo la prenotazione. */
export interface NewLessonSummary {
  customerLabel: string;
  slotLabel: string;
}

/**
 * "Prenota per un cliente", spostato dalla pagina (dove stava fisso in
 * cima, sopra il contenuto vero) in un modale — stesso shell di conferma e
 * ricevuta degli altri due modali, ma con un vero form: pannello "wide".
 */
@Component({
  selector: 'app-new-lesson-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './new-lesson-dialog.component.html',
  styleUrl: './new-lesson-dialog.component.scss',
})
export class NewLessonDialogComponent implements AfterViewInit {
  @Input({ required: true }) customers: CustomerOption[] = [];
  @Input({ required: true }) freeSlots: SlotRow[] = [];
  @Input() state: NewLessonDialogState = 'form';
  @Input() busy = false;
  @Input() errorMessage: string | null = null;
  @Input() summary: NewLessonSummary | null = null;

  @Output() readonly submitted = new EventEmitter<NewLessonFormValue>();
  @Output() readonly closed = new EventEmitter<void>();

  @ViewChild('firstField') private firstField?: ElementRef<HTMLElement>;
  @ViewChild('primaryAction') private primaryAction?: ElementRef<HTMLElement>;

  readonly form = new FormGroup({
    customerId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    slotId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    bypassWeeklyLimit: new FormControl(false, { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
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

  slotLabel(slot: SlotRow): string {
    return `${formatShortDate(slot.date)} ${slot.time_from.slice(0, 5)}–${slot.time_to.slice(0, 5)}`;
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.submitted.emit({
      customerId: Number(value.customerId),
      slotId: Number(value.slotId),
      bypassWeeklyLimit: value.bypassWeeklyLimit,
      description: value.description.trim() || undefined,
    });
  }
}
