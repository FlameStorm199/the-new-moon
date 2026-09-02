import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PartOfDay, SlotRow, SlotsService } from '../../../../core/slots/slots.service';
import { BackLinkComponent } from '../../components/back-link/back-link.component';

interface DayGroup {
  date: string;
  slots: SlotRow[];
}

type BulkScope = 'giornata' | 'mattina' | 'pomeriggio';

@Component({
  selector: 'app-gestione-slot',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, BackLinkComponent],
  templateUrl: './gestione-slot.component.html',
  styleUrl: './gestione-slot.component.scss',
})
export class GestioneSlotComponent implements OnInit {
  private readonly slotsService = inject(SlotsService);

  readonly slots = signal<SlotRow[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly savingId = signal<number | null>(null);
  readonly horizonDays = signal(7);

  readonly groupedByDate = computed<DayGroup[]>(() => {
    const groups = new Map<string, SlotRow[]>();
    for (const slot of this.slots()) {
      const list = groups.get(slot.date) ?? [];
      list.push(slot);
      groups.set(slot.date, list);
    }
    return Array.from(groups.entries()).map(([date, slots]) => ({ date, slots }));
  });

  readonly form = new FormGroup({
    date: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    partOfDay: new FormControl<PartOfDay>('mattina', { nonNullable: true }),
    timeFrom: new FormControl('09:00', { nonNullable: true, validators: [Validators.required] }),
    timeTo: new FormControl('10:00', { nonNullable: true, validators: [Validators.required] }),
  });
  readonly creating = signal(false);
  readonly createError = signal<string | null>(null);

  readonly bulkForm = new FormGroup({
    dateFrom: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    dateTo: new FormControl('', { nonNullable: true }),
    scope: new FormControl<BulkScope>('giornata', { nonNullable: true }),
  });
  readonly bulkRunning = signal(false);
  readonly bulkError = signal<string | null>(null);
  readonly bulkMessage = signal<string | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      this.slots.set(await this.slotsService.listUpcoming(this.horizonDays()));
    } catch {
      this.errorMessage.set('Errore nel caricamento degli slot.');
    } finally {
      this.loading.set(false);
    }
  }

  async changeHorizon(days: string): Promise<void> {
    this.horizonDays.set(Number(days));
    await this.load();
  }

  async toggleActive(slot: SlotRow): Promise<void> {
    this.savingId.set(slot.id);
    this.errorMessage.set(null);
    try {
      await this.slotsService.setActive(slot.id, !slot.active);
      this.slots.update((list) =>
        list.map((s) => (s.id === slot.id ? { ...s, active: !s.active } : s))
      );
    } catch (err) {
      // Es. "lo slot ha già una lezione prenotata": messaggio del database,
      // già scritto per chi lo legge.
      const message = (err as { message?: string } | null)?.message;
      this.errorMessage.set(message || 'Errore nel salvataggio.');
    } finally {
      this.savingId.set(null);
    }
  }

  /** `active = false` per liberare il periodo, `true` per riaprirlo. */
  async applyBulk(active: boolean): Promise<void> {
    if (this.bulkForm.invalid || this.bulkRunning()) {
      this.bulkForm.markAllAsTouched();
      return;
    }
    const value = this.bulkForm.getRawValue();
    if (value.dateTo && value.dateTo < value.dateFrom) {
      this.bulkError.set('La data di fine è precedente a quella di inizio.');
      return;
    }

    this.bulkRunning.set(true);
    this.bulkError.set(null);
    this.bulkMessage.set(null);
    try {
      const result = await this.slotsService.setActiveBulk({
        dateFrom: value.dateFrom,
        dateTo: value.dateTo || value.dateFrom,
        partOfDay: value.scope === 'giornata' ? null : value.scope,
        active,
      });

      const verbo = active ? 'riattivati' : 'disattivati';
      let message = `${result.updated} slot ${verbo}.`;
      if (result.occupiedSkipped > 0) {
        message +=
          ` ${result.occupiedSkipped} slot hanno già una lezione prenotata e non sono stati toccati:` +
          ' gestiscili da "Gestione lezioni".';
      }
      this.bulkMessage.set(message);
      await this.load();
    } catch (err) {
      const message = (err as { message?: string } | null)?.message;
      this.bulkError.set(message || 'Operazione non riuscita.');
    } finally {
      this.bulkRunning.set(false);
    }
  }

  async submitNewSlot(): Promise<void> {
    if (this.form.invalid || this.creating()) {
      this.form.markAllAsTouched();
      return;
    }
    this.creating.set(true);
    this.createError.set(null);
    const value = this.form.getRawValue();
    try {
      await this.slotsService.createSlot({
        date: value.date,
        partOfDay: value.partOfDay,
        timeFrom: value.timeFrom,
        timeTo: value.timeTo,
      });
      await this.load();
    } catch {
      this.createError.set(
        'Errore nella creazione dello slot (controlla che non si sovrapponga a un altro).'
      );
    } finally {
      this.creating.set(false);
    }
  }
}
