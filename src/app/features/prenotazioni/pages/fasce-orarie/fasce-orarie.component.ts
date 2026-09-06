import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  TimeSlotRuleRow,
  TimeSlotRulesService,
} from '../../../../core/slots/time-slot-rules.service';
import { BackLinkComponent } from '../../components/back-link/back-link.component';
import { UserProfileService } from '../../../../core/users/user-profile.service';

interface WeekdayGroup {
  weekday: number;
  label: string;
  /** Sempre in quest'ordine, non l'ordine di arrivo: la griglia ha una colonna fissa per ciascuna. */
  mattina: TimeSlotRuleRow | null;
  pomeriggio: TimeSlotRuleRow | null;
}

interface DraftHours {
  timeFrom: string;
  timeTo: string;
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
  imports: [CommonModule, RouterLink, BackLinkComponent],
  templateUrl: './fasce-orarie.component.html',
  styleUrl: './fasce-orarie.component.scss',
})
export class FasceOrarieComponent implements OnInit {
  private readonly rulesService = inject(TimeSlotRulesService);
  private readonly profileService = inject(UserProfileService);

  readonly rules = signal<TimeSlotRuleRow[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly infoMessage = signal<string | null>(null);
  readonly saving = signal(false);
  readonly infoOpen = signal(false);

  /**
   * Orari modificati ma non ancora salvati, per id fascia: prima ogni riga
   * aveva il suo "Salva" e cambiare più giorni voleva dire premerlo una
   * volta per riga. Qui invece si scrive quanto si vuole e si salva tutto
   * insieme con un solo bottone, che compare solo quando c'è davvero
   * qualcosa da salvare.
   */
  private readonly drafts = signal<Map<number, DraftHours>>(new Map());

  // Un assistente vede le fasce (RLS is_staff()) ma non può modificarle: la
  // scrittura resta riservata a trainer/admin (RLS tsr_update_staff). Solo
  // per non mostrargli campi e bottoni che verrebbero comunque respinti.
  readonly canAct = signal(false);

  readonly weekdayLabels = WEEKDAY_LABELS;

  readonly groupedByWeekday = computed<WeekdayGroup[]>(() => {
    const all = this.rules();
    return WEEKDAY_ORDER.map((weekday) => ({
      weekday,
      label: WEEKDAY_LABELS[weekday],
      mattina: all.find((r) => r.weekday === weekday && r.part_of_day === 'mattina') ?? null,
      pomeriggio: all.find((r) => r.weekday === weekday && r.part_of_day === 'pomeriggio') ?? null,
    }));
  });

  readonly dirtyCount = computed(() => this.drafts().size);
  readonly isDirty = computed(() => this.dirtyCount() > 0);

  ngOnInit(): void {
    void this.load();
    void this.loadRole();
  }

  private async loadRole(): Promise<void> {
    const profile = await this.profileService.getMyProfile();
    const type = profile?.typeCode;
    this.canAct.set(type === 'trainer' || type === 'admin');
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

  /** Valore da mostrare nel campo "dalle": la bozza se c'è, altrimenti quello salvato. */
  draftFrom(rule: TimeSlotRuleRow): string {
    return this.drafts().get(rule.id)?.timeFrom ?? rule.time_from.slice(0, 5);
  }

  draftTo(rule: TimeSlotRuleRow): string {
    return this.drafts().get(rule.id)?.timeTo ?? rule.time_to.slice(0, 5);
  }

  onFromChange(rule: TimeSlotRuleRow, value: string): void {
    this.setDraft(rule, { timeFrom: value, timeTo: this.draftTo(rule) });
  }

  onToChange(rule: TimeSlotRuleRow, value: string): void {
    this.setDraft(rule, { timeFrom: this.draftFrom(rule), timeTo: value });
  }

  /** Una bozza uguale ai valori salvati non conta come modifica: evita un bottone "Salva" sempre acceso per un giro a vuoto. */
  private setDraft(rule: TimeSlotRuleRow, value: DraftHours): void {
    this.drafts.update((map) => {
      const next = new Map(map);
      if (value.timeFrom === rule.time_from.slice(0, 5) && value.timeTo === rule.time_to.slice(0, 5)) {
        next.delete(rule.id);
      } else {
        next.set(rule.id, value);
      }
      return next;
    });
  }

  discardChanges(): void {
    this.drafts.set(new Map());
    this.errorMessage.set(null);
  }

  async toggleActive(rule: TimeSlotRuleRow): Promise<void> {
    this.errorMessage.set(null);
    this.infoMessage.set(null);
    try {
      await this.rulesService.setActive(rule.id, !rule.active);
      await this.load();
    } catch (err) {
      this.errorMessage.set(errorText(err) ?? 'Errore nel salvataggio della fascia oraria.');
    }
  }

  /**
   * Un'unica chiamata per tutte le fasce modificate, non una per riga.
   * Ogni scrittura fa ricalcolare gli slot futuri lato database: farlo una
   * volta sola per tutto il gruppo invece che per ogni singola fascia.
   */
  async saveAll(): Promise<void> {
    const entries = Array.from(this.drafts().entries());
    if (entries.length === 0) {
      return;
    }
    for (const [, draft] of entries) {
      if (!draft.timeFrom || !draft.timeTo) {
        this.errorMessage.set('Indica sia l’orario di inizio sia quello di fine su ogni riga modificata.');
        return;
      }
      if (draft.timeTo <= draft.timeFrom) {
        this.errorMessage.set('L’orario di fine deve essere successivo a quello di inizio su ogni riga modificata.');
        return;
      }
    }

    this.saving.set(true);
    this.errorMessage.set(null);
    this.infoMessage.set(null);
    try {
      await Promise.all(
        entries.map(([ruleId, draft]) =>
          this.rulesService.updateHours(ruleId, draft.timeFrom, draft.timeTo)
        )
      );
      this.drafts.set(new Map());
      await this.load();
      this.infoMessage.set('Fasce aggiornate: gli slot futuri sono stati ricalcolati.');
    } catch (err) {
      this.errorMessage.set(errorText(err) ?? 'Errore nel salvataggio: riprova.');
    } finally {
      this.saving.set(false);
    }
  }
}

function errorText(err: unknown): string | null {
  return (err as { message?: string } | null)?.message ?? null;
}
