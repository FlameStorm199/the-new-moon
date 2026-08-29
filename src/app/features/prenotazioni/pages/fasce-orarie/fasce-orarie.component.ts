import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
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
  imports: [CommonModule, RouterLink],
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
