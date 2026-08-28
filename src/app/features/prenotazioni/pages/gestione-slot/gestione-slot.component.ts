import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { PartOfDay, SlotRow, SlotsService } from '../../../../core/slots/slots.service';

interface DayGroup {
  date: string;
  slots: SlotRow[];
}

@Component({
  selector: 'app-gestione-slot',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './gestione-slot.component.html',
  styleUrl: './gestione-slot.component.scss',
})
export class GestioneSlotComponent implements OnInit {
  private readonly slotsService = inject(SlotsService);

  readonly slots = signal<SlotRow[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly savingId = signal<number | null>(null);

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

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      this.slots.set(await this.slotsService.listUpcoming(7));
    } catch {
      this.errorMessage.set('Errore nel caricamento degli slot.');
    } finally {
      this.loading.set(false);
    }
  }

  async toggleActive(slot: SlotRow): Promise<void> {
    this.savingId.set(slot.id);
    try {
      await this.slotsService.setActive(slot.id, !slot.active);
      this.slots.update((list) =>
        list.map((s) => (s.id === slot.id ? { ...s, active: !s.active } : s))
      );
    } catch {
      this.errorMessage.set('Errore nel salvataggio.');
    } finally {
      this.savingId.set(null);
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
