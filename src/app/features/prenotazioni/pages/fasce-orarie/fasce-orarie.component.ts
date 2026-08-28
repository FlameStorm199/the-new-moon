import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PartOfDay } from '../../../../core/slots/slots.service';
import {
  TimeSlotRuleRow,
  TimeSlotRulesService,
} from '../../../../core/slots/time-slot-rules.service';

interface WeekdayGroup {
  weekday: number;
  label: string;
  rules: TimeSlotRuleRow[];
}

// Convenzione Postgres (0 = domenica), ma mostrata partendo da lunedì, che è
// come un educatore legge la settimana.
const WEEKDAY_LABELS: Record<number, string> = {
  0: 'Domenica',
  1: 'Lunedì',
  2: 'Martedì',
  3: 'Mercoledì',
  4: 'Giovedì',
  5: 'Venerdì',
  6: 'Sabato',
};
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

@Component({
  selector: 'app-fasce-orarie',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './fasce-orarie.component.html',
  styleUrl: './fasce-orarie.component.scss',
})
export class FasceOrarieComponent implements OnInit {
  private readonly rulesService = inject(TimeSlotRulesService);

  readonly rules = signal<TimeSlotRuleRow[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly infoMessage = signal<string | null>(null);
  readonly savingId = signal<number | null>(null);

  readonly weekdayOrder = WEEKDAY_ORDER;
  readonly weekdayLabels = WEEKDAY_LABELS;

  readonly groupedByWeekday = computed<WeekdayGroup[]>(() =>
    WEEKDAY_ORDER.map((weekday) => ({
      weekday,
      label: WEEKDAY_LABELS[weekday],
      rules: this.rules().filter((r) => r.weekday === weekday),
    }))
  );

  readonly form = new FormGroup({
    // Stringa, non numero: <option [value]="day"> produce sempre valori string
    // e con un default numerico la select resterebbe senza selezione iniziale.
    weekday: new FormControl('1', { nonNullable: true, validators: [Validators.required] }),
    partOfDay: new FormControl<PartOfDay>('mattina', { nonNullable: true }),
    timeFrom: new FormControl('09:00', { nonNullable: true, validators: [Validators.required] }),
    timeTo: new FormControl('12:00', { nonNullable: true, validators: [Validators.required] }),
  });
  readonly creating = signal(false);

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      this.rules.set(await this.rulesService.list());
    } catch {
      this.errorMessage.set('Errore nel caricamento delle fasce orarie.');
    } finally {
      this.loading.set(false);
    }
  }

  async toggleActive(rule: TimeSlotRuleRow): Promise<void> {
    await this.run(rule.id, () => this.rulesService.setActive(rule.id, !rule.active));
  }

  async saveHours(rule: TimeSlotRuleRow, timeFrom: string, timeTo: string): Promise<void> {
    if (!timeFrom || !timeTo) {
      this.errorMessage.set('Indica sia l’orario di inizio sia quello di fine.');
      return;
    }
    if (timeTo <= timeFrom) {
      this.errorMessage.set('L’orario di fine deve essere successivo a quello di inizio.');
      return;
    }
    await this.run(rule.id, () => this.rulesService.updateHours(rule.id, timeFrom, timeTo));
  }

  async remove(rule: TimeSlotRuleRow): Promise<void> {
    const label = `${this.weekdayLabels[rule.weekday]} ${rule.time_from.slice(0, 5)}-${rule.time_to.slice(0, 5)}`;
    if (!confirm(`Eliminare la fascia ${label}? Gli slot liberi che ne derivano verranno rimossi.`)) {
      return;
    }
    await this.run(rule.id, () => this.rulesService.softDelete(rule.id));
  }

  async submitNewRule(): Promise<void> {
    if (this.form.invalid || this.creating()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    if (value.timeTo <= value.timeFrom) {
      this.errorMessage.set('L’orario di fine deve essere successivo a quello di inizio.');
      return;
    }
    this.creating.set(true);
    await this.run(null, () =>
      this.rulesService.create({
        weekday: Number(value.weekday),
        partOfDay: value.partOfDay,
        timeFrom: value.timeFrom,
        timeTo: value.timeTo,
      })
    );
    this.creating.set(false);
  }

  /**
   * Ogni scrittura sulle fasce fa ricalcolare gli slot futuri lato database:
   * i messaggi di errore che arrivano da lì (fasce sovrapposte, orari non
   * validi) sono già scritti per l'utente finale, quindi vengono mostrati
   * così come sono invece di essere sostituiti da un generico "errore".
   */
  private async run(ruleId: number | null, action: () => Promise<void>): Promise<void> {
    this.savingId.set(ruleId);
    this.errorMessage.set(null);
    this.infoMessage.set(null);
    try {
      await action();
      await this.load();
      this.infoMessage.set('Fasce aggiornate: gli slot futuri sono stati ricalcolati.');
    } catch (err) {
      const message = (err as { message?: string } | null)?.message;
      this.errorMessage.set(message || 'Errore nel salvataggio della fascia oraria.');
    } finally {
      this.savingId.set(null);
    }
  }
}
