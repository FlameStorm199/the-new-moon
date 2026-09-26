import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ClosedDay, ClosedDayScope, SlotsService } from '../../../../core/slots/slots.service';
import { UserProfileService } from '../../../../core/users/user-profile.service';
import { BackLinkComponent } from '../../components/back-link/back-link.component';
import {
  ClosePeriodDialogComponent,
  ClosePeriodDialogState,
  ClosePeriodFormValue,
} from '../../components/close-period-dialog/close-period-dialog.component';
import { ConfirmDialogComponent } from '../../components/confirm-dialog/confirm-dialog.component';
import {
  dateBlockParts,
  formatDateRange,
  formatLongDate,
  todayIso,
} from '../../components/date-format';

const SCOPE_LABELS: Record<ClosedDayScope, string> = {
  giornata: 'Tutta la giornata',
  mattina: 'Solo mattina',
  pomeriggio: 'Solo pomeriggio',
};

/**
 * Giorni consecutivi chiusi allo stesso modo (stessa parte di giornata,
 * stesso motivo): in tabella sono una riga per giorno, ma per chi le
 * gestisce "ferie 10–24 agosto" è una chiusura sola, non quindici.
 */
interface ClosureGroup {
  key: string;
  from: string;
  to: string;
  scope: ClosedDayScope;
  reason: string | null;
  days: ClosedDay[];
}

/**
 * Ha preso il posto di "Gestione slot": gli slot si guardano, si aprono e
 * si chiudono dal calendario della home ("Aggiungi slot" è in Fasce
 * orarie), qui restano le chiusure — ferie, festivi, mezze giornate — che
 * nel calendario si vedono ma non si gestiscono.
 */
@Component({
  selector: 'app-gestione-chiusure',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    BackLinkComponent,
    ClosePeriodDialogComponent,
    ConfirmDialogComponent,
  ],
  templateUrl: './gestione-chiusure.component.html',
  styleUrl: './gestione-chiusure.component.scss',
})
export class GestioneChiusureComponent implements OnInit {
  private readonly slotsService = inject(SlotsService);
  private readonly profileService = inject(UserProfileService);

  readonly formatDate = formatLongDate;
  readonly formatRange = formatDateRange;
  readonly dateBlock = dateBlockParts;
  /** Metodo e non la mappa: nel template la card è un ng-template, con contesto non tipizzato. */
  scopeLabel(scope: ClosedDayScope): string {
    return SCOPE_LABELS[scope];
  }

  // Un assistente vede le chiusure (RLS is_staff()) ma non può crearle né
  // riaprirle: stesso principio delle altre pagine di gestione.
  readonly canAct = signal(false);

  readonly closedDays = signal<ClosedDay[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly infoMessage = signal<string | null>(null);
  readonly showPast = signal(false);
  readonly expandedKey = signal<string | null>(null);
  /** Giorno singolo in riapertura, dentro un gruppo espanso. */
  readonly reopeningDayKey = signal<string | null>(null);

  // --- "Chiudi campo" ---
  readonly closePeriodOpen = signal(false);
  readonly closePeriodState = signal<ClosePeriodDialogState>('form');
  readonly closePeriodBusy = signal(false);
  readonly closePeriodError = signal<string | null>(null);
  readonly closePeriodResult = signal<string | null>(null);

  // --- Conferma "Riapri" di un'intera chiusura ---
  readonly reopeningGroup = signal<ClosureGroup | null>(null);
  readonly reopenBusy = signal(false);
  readonly reopenError = signal<string | null>(null);

  private readonly groups = computed(() => groupClosures(this.closedDays()));

  /** In corso o future: quelle su cui si può ancora agire. */
  readonly upcomingGroups = computed(() => {
    const today = todayIso();
    return this.groups().filter((g) => g.to >= today);
  });

  /** Già passate, dalla più recente: servono solo come promemoria. */
  readonly pastGroups = computed(() => {
    const today = todayIso();
    return this.groups()
      .filter((g) => g.to < today)
      .reverse();
  });

  readonly upcomingDaysCount = computed(() =>
    this.upcomingGroups().reduce((sum, g) => sum + g.days.length, 0)
  );

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
      this.closedDays.set(await this.slotsService.listClosedDays());
    } catch {
      this.errorMessage.set('Errore nel caricamento delle chiusure.');
    } finally {
      this.loading.set(false);
    }
  }

  isOngoing(group: ClosureGroup): boolean {
    const today = todayIso();
    return group.from <= today && today <= group.to;
  }

  dayKey(day: ClosedDay): string {
    return `${day.date}:${day.part_of_day}`;
  }

  toggleExpanded(group: ClosureGroup): void {
    this.expandedKey.set(this.expandedKey() === group.key ? null : group.key);
  }

  // --- "Chiudi campo" ---

  openClosePeriod(): void {
    this.closePeriodState.set('form');
    this.closePeriodError.set(null);
    this.closePeriodResult.set(null);
    this.closePeriodOpen.set(true);
  }

  closeClosePeriodDialog(): void {
    this.closePeriodOpen.set(false);
  }

  async submitClosePeriod(value: ClosePeriodFormValue): Promise<void> {
    this.closePeriodBusy.set(true);
    this.closePeriodError.set(null);
    try {
      const result = await this.slotsService.closePeriod({
        dateFrom: value.dateFrom,
        dateTo: value.dateTo,
        partOfDay: value.scope === 'giornata' ? null : value.scope,
        active: false,
        reason: value.reason,
      });

      const giorni = result.days === 1 ? '1 giorno' : `${result.days} giorni`;
      let message = `${giorni} chiusi.`;
      if (result.occupiedSkipped > 0) {
        message +=
          ` ${result.occupiedSkipped} slot in quell'intervallo hanno già una lezione prenotata e` +
          ' non sono stati toccati: gestiscili da "Gestione lezioni".';
      }
      this.closePeriodResult.set(message);
      this.closePeriodState.set('success');
      await this.load();
    } catch (err) {
      this.closePeriodError.set(errorText(err) ?? 'Operazione non riuscita.');
    } finally {
      this.closePeriodBusy.set(false);
    }
  }

  // --- Riapertura ---

  openReopen(group: ClosureGroup): void {
    this.reopeningGroup.set(group);
    this.reopenError.set(null);
  }

  closeReopen(): void {
    this.reopeningGroup.set(null);
  }

  reopenMessage(group: ClosureGroup): string {
    const what = group.days.length === 1 ? 'La giornata' : `I ${group.days.length} giorni`;
    return (
      `${formatDateRange(group.from, group.to)} · ${SCOPE_LABELS[group.scope].toLowerCase()}. ` +
      `${what} torneranno prenotabili secondo le fasce orarie.`
    );
  }

  /**
   * Una riga per volta: la tabella non ha una riapertura per intervallo.
   * Se una fallisce a metà, le già riaperte restano tali e la lista viene
   * ricaricata, così mostra lo stato vero.
   */
  async confirmReopen(): Promise<void> {
    const group = this.reopeningGroup();
    if (!group) return;

    this.reopenBusy.set(true);
    this.reopenError.set(null);
    try {
      for (const day of group.days) {
        await this.slotsService.removeClosedDay(day.date, day.part_of_day);
      }
      this.reopeningGroup.set(null);
      this.infoMessage.set(`Riaperto: ${formatDateRange(group.from, group.to)}.`);
      await this.load();
    } catch (err) {
      this.reopenError.set(errorText(err) ?? 'Riapertura non riuscita.');
      await this.load();
    } finally {
      this.reopenBusy.set(false);
    }
  }

  /** Un giorno solo dentro una chiusura lunga (es. un giorno di ferie annullato). */
  async reopenDay(day: ClosedDay): Promise<void> {
    const key = this.dayKey(day);
    this.reopeningDayKey.set(key);
    this.errorMessage.set(null);
    this.infoMessage.set(null);
    try {
      await this.slotsService.removeClosedDay(day.date, day.part_of_day);
      this.closedDays.update((list) => list.filter((d) => this.dayKey(d) !== key));
      this.infoMessage.set(`Riaperto: ${formatLongDate(day.date)}.`);
    } catch (err) {
      this.errorMessage.set(errorText(err) ?? 'Riapertura non riuscita.');
    } finally {
      this.reopeningDayKey.set(null);
    }
  }
}

function groupClosures(days: ClosedDay[]): ClosureGroup[] {
  const sorted = days
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.part_of_day.localeCompare(b.part_of_day));

  const groups: ClosureGroup[] = [];
  for (const day of sorted) {
    // Si accoda a un gruppo aperto con stessa parte di giornata e stesso
    // motivo, che finisca esattamente il giorno prima.
    const target = groups.find(
      (g) =>
        g.scope === day.part_of_day &&
        (g.reason ?? '') === (day.reason ?? '') &&
        nextDay(g.to) === day.date
    );
    if (target) {
      target.to = day.date;
      target.days.push(day);
    } else {
      groups.push({
        key: `${day.date}:${day.part_of_day}`,
        from: day.date,
        to: day.date,
        scope: day.part_of_day,
        reason: day.reason,
        days: [day],
      });
    }
  }
  return groups.sort((a, b) => a.from.localeCompare(b.from));
}

function nextDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d + 1);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function errorText(err: unknown): string | null {
  return (err as { message?: string } | null)?.message ?? null;
}
