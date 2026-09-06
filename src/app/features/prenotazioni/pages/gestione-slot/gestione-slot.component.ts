import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SlotRow, SlotsService } from '../../../../core/slots/slots.service';
import { BackLinkComponent } from '../../components/back-link/back-link.component';
import {
  ClosePeriodDialogComponent,
  ClosePeriodDialogState,
  ClosePeriodFormValue,
} from '../../components/close-period-dialog/close-period-dialog.component';
import { formatLongDate, formatShortDate } from '../../components/date-format';
import {
  NewSlotDialogComponent,
  NewSlotDialogState,
  NewSlotFormValue,
} from '../../components/new-slot-dialog/new-slot-dialog.component';
import { ClosedDaysDialogComponent } from '../../components/closed-days-dialog/closed-days-dialog.component';
import { UserProfileService } from '../../../../core/users/user-profile.service';

interface DayGroup {
  date: string;
  slots: SlotRow[];
}

@Component({
  selector: 'app-gestione-slot',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    BackLinkComponent,
    NewSlotDialogComponent,
    ClosePeriodDialogComponent,
    ClosedDaysDialogComponent,
  ],
  templateUrl: './gestione-slot.component.html',
  styleUrl: './gestione-slot.component.scss',
})
export class GestioneSlotComponent implements OnInit {
  private readonly slotsService = inject(SlotsService);
  private readonly profileService = inject(UserProfileService);

  /** Intestazione di ogni giornata: per esteso, come in gestione lezioni. */
  readonly formatDayHeader = formatLongDate;

  // Un assistente vede tutti gli slot (RLS is_staff()) ma non può crearli,
  // attivarli/disattivarli né chiudere periodi o giornate: le RPC coinvolte
  // respingono già chi non è trainer/admin, qui solo per non mostrargli
  // controlli inutili.
  readonly canAct = signal(false);

  readonly slots = signal<SlotRow[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly savingId = signal<number | null>(null);
  readonly horizonDays = signal(7);

  // --- Modale "Aggiungi slot" ---
  readonly newSlotOpen = signal(false);
  readonly newSlotState = signal<NewSlotDialogState>('form');
  readonly newSlotBusy = signal(false);
  readonly newSlotError = signal<string | null>(null);
  readonly newSlotSummary = signal<string | null>(null);

  // --- Modale "Chiudi o riapri un periodo" ---
  readonly closePeriodOpen = signal(false);
  readonly closePeriodState = signal<ClosePeriodDialogState>('form');
  readonly closePeriodBusy = signal(false);
  readonly closePeriodError = signal<string | null>(null);
  readonly closePeriodResult = signal<string | null>(null);

  // --- Modale "Giorni di chiusura" ---
  readonly closedDaysOpen = signal(false);

  readonly groupedByDate = computed<DayGroup[]>(() => {
    const groups = new Map<string, SlotRow[]>();
    for (const slot of this.slots()) {
      const list = groups.get(slot.date) ?? [];
      list.push(slot);
      groups.set(slot.date, list);
    }
    return Array.from(groups.entries()).map(([date, slots]) => ({ date, slots }));
  });

  readonly totalCount = computed(() => this.slots().length);
  readonly occupiedCount = computed(() => this.slots().filter((s) => s.occupied).length);

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
      this.errorMessage.set(errorText(err) ?? 'Errore nel salvataggio.');
    } finally {
      this.savingId.set(null);
    }
  }

  // --- "Aggiungi slot" ---

  openNewSlot(): void {
    this.newSlotState.set('form');
    this.newSlotError.set(null);
    this.newSlotSummary.set(null);
    this.newSlotOpen.set(true);
  }

  closeNewSlotDialog(): void {
    this.newSlotOpen.set(false);
  }

  async submitNewSlot(value: NewSlotFormValue): Promise<void> {
    this.newSlotBusy.set(true);
    this.newSlotError.set(null);
    try {
      await this.slotsService.createSlot(value);
      this.newSlotSummary.set(
        `${formatShortDate(value.date)} ${value.timeFrom}–${value.timeTo}`
      );
      this.newSlotState.set('success');
      await this.load();
    } catch {
      this.newSlotError.set(
        'Errore nella creazione dello slot (controlla che non si sovrapponga a un altro).'
      );
    } finally {
      this.newSlotBusy.set(false);
    }
  }

  // --- "Chiudi o riapri un periodo" ---

  openClosePeriod(): void {
    this.closePeriodState.set('form');
    this.closePeriodError.set(null);
    this.closePeriodResult.set(null);
    this.closePeriodOpen.set(true);
  }

  closeClosePeriodDialog(): void {
    this.closePeriodOpen.set(false);
  }

  /** Solo chiusura: per riaprire una data si passa da "Elenco chiusure" (closeClosedDaysDialog). */
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
  // --- "Giorni di chiusura" ---

  openClosedDays(): void {
    this.closedDaysOpen.set(true);
  }

  async closeClosedDaysDialog(): Promise<void> {
    this.closedDaysOpen.set(false);
    // Chiudere/riaprire una data può aver cambiato gli slot già generati
    // (se dentro l'orizzonte): la lista sotto va aggiornata alla chiusura,
    // non serve tenerla sincronizzata mentre il modale resta aperto.
    await this.load();
  }
}

function errorText(err: unknown): string | null {
  return (err as { message?: string } | null)?.message ?? null;
}
