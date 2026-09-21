import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnInit, Output, ViewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { EventInput, EventRow } from '../../../../core/events/events.service';

export type EventFormDialogState = 'form' | 'success';
export type EventFormMode = 'create' | 'edit';

/**
 * Crea o modifica un evento (create_event/update_event, stessi campi per
 * entrambe — vedi database/29_fase2_events_rpc.sql). Un solo componente per
 * i due modi invece di due quasi identici: cambia solo il titolo, il testo
 * del bottone e se `event` arriva già valorizzato per precompilare il form.
 */
@Component({
  selector: 'app-event-form-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './event-form-dialog.component.html',
  styleUrl: './event-form-dialog.component.scss',
})
export class EventFormDialogComponent implements OnInit, AfterViewInit {
  @Input({ required: true }) mode!: EventFormMode;
  /** Valorizzato solo in modalità 'edit', per precompilare il form. */
  @Input() event: EventRow | null = null;
  @Input() state: EventFormDialogState = 'form';
  @Input() busy = false;
  @Input() errorMessage: string | null = null;

  @Output() readonly submitted = new EventEmitter<EventInput>();
  @Output() readonly closed = new EventEmitter<void>();

  @ViewChild('firstField') private firstField?: ElementRef<HTMLElement>;
  @ViewChild('primaryAction') private primaryAction?: ElementRef<HTMLElement>;

  readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    location: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    date: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    timeFrom: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    timeTo: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    maxCustomers: new FormControl('', { nonNullable: true }),
    price: new FormControl('', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
  });

  ngOnInit(): void {
    if (this.mode === 'edit' && this.event) {
      const e = this.event;
      this.form.setValue({
        title: e.title,
        location: e.location,
        date: e.date,
        timeFrom: e.time_from.slice(0, 5),
        timeTo: e.time_to.slice(0, 5),
        maxCustomers: e.max_customers !== null ? String(e.max_customers) : '',
        price: e.price !== null ? String(e.price) : '',
        description: e.description ?? '',
      });
    }
  }

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
    this.submitted.emit({
      title: value.title.trim(),
      location: value.location.trim(),
      date: value.date,
      timeFrom: value.timeFrom,
      timeTo: value.timeTo,
      maxCustomers: value.maxCustomers.trim() ? Number(value.maxCustomers) : null,
      price: value.price.trim() ? Number(value.price) : null,
      description: value.description.trim() || null,
    });
  }
}
