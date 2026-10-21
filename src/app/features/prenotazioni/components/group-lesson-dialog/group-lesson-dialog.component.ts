import { Component, EventEmitter, HostListener, Input, Output, computed, inject, signal } from '@angular/core';
import { BookingService } from '../../../../core/lessons/booking.service';
import { LessonRow, LessonsService } from '../../../../core/lessons/lessons.service';
import { SlotRow, SlotsService, groupLabel, isGroupSlot } from '../../../../core/slots/slots.service';
import { CustomerOption, UserProfileService } from '../../../../core/users/user-profile.service';
import { formatLongDate, formatShortDate, formatTimeRange } from '../date-format';

type View = 'overview' | 'edit' | 'add' | 'move' | 'cancel';

const ACTIVE = new Set(['pending', 'confirmed']);
const DEFAULT_CAPACITY = 6;
const MAX_CAPACITY = 30;
/** Risultati mostrati nella ricerca del partecipante: oltre si affina la ricerca. */
const MAX_MATCHES = 8;

/**
 * Scheda di una lezione collettiva (slot con più posti, vedi
 * database/40_lezioni_collettive.sql) dal calendario staff.
 *
 * Su uno slot ancora individuale si apre direttamente sul modulo posti/nome:
 * è così che una lezione collettiva nasce. Su una collettiva mostra gli
 * iscritti e le azioni sul gruppo intero; le azioni sul singolo iscritto
 * (sposta solo lui, cancella solo lui) restano quelle di sempre, dal
 * dettaglio lezione che si apre cliccandone il nome (lessonOpen).
 *
 * A differenza degli altri modali, che ricevono lo stato dal genitore, questo
 * chiama i servizi da sé: le sue cinque azioni avrebbero moltiplicato lo
 * stato da tenere nell'area personale. Dopo ogni modifica emette `changed`,
 * e il genitore ricarica il calendario (da cui arrivano slot e iscritti
 * aggiornati).
 */
@Component({
  selector: 'app-group-lesson-dialog',
  standalone: true,
  templateUrl: './group-lesson-dialog.component.html',
  styleUrl: './group-lesson-dialog.component.scss',
})
export class GroupLessonDialogComponent {
  private readonly slotsService = inject(SlotsService);
  private readonly lessonsService = inject(LessonsService);
  private readonly bookingService = inject(BookingService);
  private readonly profileService = inject(UserProfileService);

  private readonly slotSignal = signal<SlotRow | null>(null);
  private readonly lessonsSignal = signal<LessonRow[]>([]);
  private readonly slotsSignal = signal<SlotRow[]>([]);

  @Input({ required: true })
  set slot(value: SlotRow) {
    const previous = this.slotSignal();
    this.slotSignal.set(value);
    // Primo ingresso: uno slot individuale si apre sul modulo di creazione.
    if (!previous) {
      this.view.set(isGroupSlot(value) ? 'overview' : 'edit');
      this.capacityValue = isGroupSlot(value) ? value.capacity : DEFAULT_CAPACITY;
      this.labelValue = value.group_label ?? '';
    }
  }

  /** Lezioni del calendario: qui servono solo quelle di questo slot. */
  @Input()
  set lessons(value: LessonRow[]) {
    this.lessonsSignal.set(value ?? []);
  }

  /** Slot del calendario: per scegliere dove spostare tutta la collettiva. */
  @Input()
  set slots(value: SlotRow[]) {
    this.slotsSignal.set(value ?? []);
  }

  /** false per l'assistente: vede iscritti e dettagli, non modifica. */
  @Input() canAct = true;

  @Output() readonly changed = new EventEmitter<void>();
  /** Dopo "Sposta tutti" la collettiva vive su un altro slot: il genitore segue quello. */
  @Output() readonly slotMoved = new EventEmitter<number>();
  @Output() readonly lessonOpen = new EventEmitter<LessonRow>();
  @Output() readonly closed = new EventEmitter<void>();

  readonly view = signal<View>('overview');
  readonly busy = signal(false);
  readonly errorMessage = signal<string | null>(null);

  // Modulo posti/nome (creazione e modifica): campi semplici, non un FormGroup.
  capacityValue = DEFAULT_CAPACITY;
  labelValue = '';
  readonly maxCapacity = MAX_CAPACITY;

  // Aggiungi partecipante
  private readonly customers = signal<CustomerOption[] | null>(null);
  readonly customerQuery = signal('');
  bypassWeeklyLimit = false;

  // Sposta tutti / cancella per tutti
  moveTargetId: number | null = null;
  cancelReason = '';

  readonly current = computed(() => this.slotSignal()!);
  readonly isGroup = computed(() => isGroupSlot(this.current()));
  readonly title = computed(() => (this.isGroup() ? groupLabel(this.current()) : 'Nuova lezione collettiva'));
  readonly dateLabel = computed(() => formatLongDate(this.current().date));
  readonly timeLabel = computed(() => formatTimeRange(this.current().time_from, this.current().time_to));

  readonly participants = computed(() =>
    this.lessonsSignal()
      .filter((l) => l.slot_id === this.current().id && ACTIVE.has(l.status))
      .sort((a, b) => `${a.customer_surname} ${a.customer_name}`.localeCompare(`${b.customer_surname} ${b.customer_name}`))
  );

  readonly seatsLabel = computed(() => `${this.participants().length} / ${this.current().capacity}`);
  readonly isFull = computed(() => this.participants().length >= this.current().capacity);

  /** Clienti cercabili: per nome, cognome o cane; esclusi quelli già iscritti. */
  readonly customerMatches = computed(() => {
    const list = this.customers() ?? [];
    const enrolled = new Set(this.participants().map((p) => p.customer_id));
    const q = this.customerQuery().trim().toLowerCase();
    return list
      .filter((c) => !enrolled.has(c.id))
      .filter((c) => !q || `${c.name} ${c.surname} ${c.dog_name ?? ''}`.toLowerCase().includes(q))
      .slice(0, MAX_MATCHES);
  });
  readonly customersLoading = computed(() => this.view() === 'add' && this.customers() === null);

  /** Dove spostare tutta la collettiva: slot futuri, attivi, liberi e individuali. */
  readonly moveTargets = computed(() => {
    const now = Date.now();
    const id = this.current().id;
    return this.slotsSignal()
      .filter((s) => s.id !== id && s.active && !s.occupied && !isGroupSlot(s))
      .filter((s) => new Date(`${s.date}T${s.time_from}`).getTime() > now)
      .sort((a, b) => `${a.date}T${a.time_from}`.localeCompare(`${b.date}T${b.time_from}`));
  });

  readonly formatShortDate = formatShortDate;

  customerLabel(c: { name: string; surname: string; dog_name: string | null }): string {
    return `${c.name} ${c.surname}${c.dog_name ? ` (${c.dog_name})` : ''}`;
  }

  participantLabel(l: LessonRow): string {
    return this.customerLabel({ name: l.customer_name, surname: l.customer_surname, dog_name: l.customer_dog_name });
  }

  slotOptionLabel(s: SlotRow): string {
    return `${formatShortDate(s.date)} ${s.time_from.slice(0, 5)}–${s.time_to.slice(0, 5)}`;
  }

  show(view: View): void {
    this.errorMessage.set(null);
    this.view.set(view);
    if (view === 'edit') {
      this.capacityValue = this.isGroup() ? this.current().capacity : DEFAULT_CAPACITY;
      this.labelValue = this.current().group_label ?? '';
    }
    if (view === 'add') {
      this.customerQuery.set('');
      this.bypassWeeklyLimit = false;
      void this.loadCustomers();
    }
    if (view === 'move') {
      this.moveTargetId = null;
    }
    if (view === 'cancel') {
      this.cancelReason = '';
    }
  }

  /** Annulla di un sotto-modulo: torna alla scheda, o chiude se la collettiva non esiste ancora. */
  back(): void {
    if (this.isGroup()) {
      this.show('overview');
    } else {
      this.closed.emit();
    }
  }

  async saveCapacity(): Promise<void> {
    const capacity = Math.floor(Number(this.capacityValue));
    if (!Number.isFinite(capacity) || capacity < 2 || capacity > MAX_CAPACITY) {
      this.errorMessage.set(`I posti di una lezione collettiva vanno da 2 a ${MAX_CAPACITY}.`);
      return;
    }
    await this.run(async () => {
      await this.slotsService.setCapacity(this.current().id, capacity, this.labelValue);
      this.view.set('overview');
    });
  }

  async makeIndividual(): Promise<void> {
    await this.run(async () => {
      await this.slotsService.setCapacity(this.current().id, 1);
      this.closed.emit();
    });
  }

  async addParticipant(customer: CustomerOption): Promise<void> {
    await this.run(async () => {
      await this.bookingService.bookLessonForCustomer(this.current().id, customer.id, this.bypassWeeklyLimit);
      this.view.set('overview');
    });
  }

  async moveAll(): Promise<void> {
    const target = this.moveTargetId;
    if (!target) {
      this.errorMessage.set('Scegli il nuovo orario.');
      return;
    }
    await this.run(async () => {
      await this.lessonsService.moveGroupLesson(this.current().id, target);
      this.slotMoved.emit(target);
      this.view.set('overview');
    });
  }

  async cancelAll(): Promise<void> {
    await this.run(async () => {
      await this.lessonsService.cancelGroupLesson(this.current().id, this.cancelReason);
      this.view.set('overview');
    });
  }

  openParticipant(lesson: LessonRow): void {
    this.lessonOpen.emit(lesson);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.busy()) {
      this.closed.emit();
    }
  }

  onBackdropClick(): void {
    if (!this.busy()) {
      this.closed.emit();
    }
  }

  private async loadCustomers(): Promise<void> {
    if (this.customers() !== null) {
      return;
    }
    try {
      this.customers.set(await this.profileService.listBookableCustomers());
    } catch {
      this.customers.set([]);
      this.errorMessage.set('Non riusciamo a caricare i clienti. Riprova.');
    }
  }

  /** Esegue un'azione: busy, errore leggibile, e `changed` per far ricaricare il calendario. */
  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.errorMessage.set(null);
    try {
      await action();
      this.changed.emit();
    } catch (err) {
      this.errorMessage.set(errorText(err) ?? 'Operazione non riuscita. Riprova.');
    } finally {
      this.busy.set(false);
    }
  }
}

function errorText(err: unknown): string | null {
  return (err as { message?: string } | null)?.message ?? null;
}
