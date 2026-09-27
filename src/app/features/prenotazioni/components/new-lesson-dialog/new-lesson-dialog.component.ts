import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { SlotRow } from '../../../../core/slots/slots.service';
import { CustomerOption } from '../../../../core/users/user-profile.service';
import { dateBlockParts, formatLongDate, formatTimeRange } from '../date-format';

export type NewLessonDialogState = 'form' | 'success';

/** Oltre questo numero l'elenco chiede di affinare la ricerca invece di mostrare tutto. */
const MAX_VISIBLE_CUSTOMERS = 50;

export interface NewLessonFormValue {
  customerId: number;
  slotId: number;
  bypassWeeklyLimit: boolean;
  description?: string;
}

interface SlotDay {
  date: string;
  weekday: string;
  day: number;
  month: string;
  count: number;
}

interface SlotPart {
  label: string;
  slots: SlotRow[];
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
 *
 * Il cliente si sceglie da una casella di ricerca (combobox) e non da una
 * <select>: con molti clienti scorrere una tendina alfabetica era lento.
 * Si cerca per cognome, nome o nome del cane, anche con più parole.
 *
 * Lo slot allo stesso modo: prima il giorno (una fila di "foglietti"), poi
 * l'orario tra quelli liberi di quel giorno, divisi in mattina e
 * pomeriggio — al posto di una tendina lunga di date e orari tutti uguali.
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

  // --- Ricerca cliente ---
  customerQuery = '';
  listOpen = false;
  activeIndex = 0;
  selectedCustomer: CustomerOption | null = null;
  /** "Hai scritto ma non scelto": mostrato solo dopo un tentativo di invio. */
  customerError: string | null = null;

  /** Clienti che corrispondono a tutte le parole scritte, in qualunque ordine. */
  get matchingCustomers(): CustomerOption[] {
    const tokens = normalize(this.customerQuery).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      return this.customers;
    }
    return this.customers.filter((c) => {
      const haystack = normalize(`${c.surname} ${c.name} ${c.dog_name ?? ''}`);
      return tokens.every((t) => haystack.includes(t));
    });
  }

  get visibleCustomers(): CustomerOption[] {
    return this.matchingCustomers.slice(0, MAX_VISIBLE_CUSTOMERS);
  }

  get hiddenCount(): number {
    return Math.max(0, this.matchingCustomers.length - MAX_VISIBLE_CUSTOMERS);
  }

  customerLabel(c: CustomerOption): string {
    return `${c.surname} ${c.name}${c.dog_name ? ` (${c.dog_name})` : ''}`;
  }

  onCustomerQuery(value: string): void {
    this.customerQuery = value;
    this.activeIndex = 0;
    this.listOpen = true;
    this.customerError = null;
    // Modificare il testo dopo una scelta la annulla: il campo mostra
    // sempre o una scelta valida o una ricerca in corso, mai un ibrido.
    if (this.selectedCustomer) {
      this.selectedCustomer = null;
      this.form.controls.customerId.setValue('');
    }
  }

  openList(): void {
    if (!this.selectedCustomer) {
      this.listOpen = true;
    }
  }

  chooseCustomer(c: CustomerOption): void {
    this.selectedCustomer = c;
    this.customerQuery = this.customerLabel(c);
    this.form.controls.customerId.setValue(String(c.id));
    this.customerError = null;
    this.listOpen = false;
  }

  clearCustomer(input: HTMLInputElement): void {
    this.selectedCustomer = null;
    this.customerQuery = '';
    this.form.controls.customerId.setValue('');
    this.activeIndex = 0;
    this.listOpen = true;
    input.focus();
  }

  onCustomerKeydown(event: KeyboardEvent): void {
    const list = this.visibleCustomers;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.listOpen = true;
        this.activeIndex = Math.min(this.activeIndex + 1, list.length - 1);
        this.scrollActiveIntoView();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.activeIndex = Math.max(this.activeIndex - 1, 0);
        this.scrollActiveIntoView();
        break;
      case 'Enter':
        // Invio sceglie il cliente evidenziato invece di inviare il form a metà.
        if (this.listOpen && list[this.activeIndex]) {
          event.preventDefault();
          this.chooseCustomer(list[this.activeIndex]);
        }
        break;
      case 'Escape':
        // Chiude solo l'elenco: senza stopPropagation l'Esc arriverebbe al
        // documento e chiuderebbe l'intero modale.
        if (this.listOpen) {
          event.stopPropagation();
          this.listOpen = false;
        }
        break;
    }
  }

  onCustomerBlur(): void {
    this.listOpen = false;
  }

  private scrollActiveIntoView(): void {
    queueMicrotask(() =>
      document.getElementById(`customer-opt-${this.activeIndex}`)?.scrollIntoView({ block: 'nearest' })
    );
  }

  // --- Scelta slot: giorno, poi orario ---
  readonly dateBlock = dateBlockParts;
  /** Giorno scelto nella fila; null = il primo con posti liberi. */
  pickedDate: string | null = null;
  selectedSlot: SlotRow | null = null;
  slotError: string | null = null;

  get slotDays(): SlotDay[] {
    const counts = new Map<string, number>();
    for (const slot of this.freeSlots) {
      counts.set(slot.date, (counts.get(slot.date) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count, ...dateBlockParts(date) }));
  }

  get activeDate(): string | null {
    return this.pickedDate ?? this.slotDays[0]?.date ?? null;
  }

  /** Orari del giorno attivo, divisi per mattina e pomeriggio (solo le parti che ne hanno). */
  get activeDayParts(): SlotPart[] {
    const date = this.activeDate;
    const daySlots = this.freeSlots
      .filter((s) => s.date === date)
      .sort((a, b) => a.time_from.localeCompare(b.time_from));
    return [
      { label: 'Mattina', slots: daySlots.filter((s) => s.part_of_day === 'mattina') },
      { label: 'Pomeriggio', slots: daySlots.filter((s) => s.part_of_day === 'pomeriggio') },
    ].filter((part) => part.slots.length > 0);
  }

  get selectedSlotLabel(): string | null {
    const slot = this.selectedSlot;
    if (!slot) return null;
    const date = formatLongDate(slot.date);
    return `${date.charAt(0).toUpperCase()}${date.slice(1)} · ${formatTimeRange(slot.time_from, slot.time_to)}`;
  }

  pickDay(date: string): void {
    this.pickedDate = date;
  }

  chooseSlot(slot: SlotRow): void {
    this.selectedSlot = slot;
    this.form.controls.slotId.setValue(String(slot.id));
    this.slotError = null;
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
    if (!this.selectedCustomer) {
      this.customerError = this.customerQuery.trim()
        ? "Scegli il cliente dall'elenco sotto la ricerca."
        : 'Cerca e scegli un cliente.';
    }
    if (!this.selectedSlot) {
      this.slotError = 'Scegli un orario.';
    }
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

/** Minuscole e senza accenti: "nicolò" si trova anche scrivendo "nicolo". */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
