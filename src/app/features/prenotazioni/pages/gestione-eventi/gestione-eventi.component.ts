import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { EventInput, EventRow, EventsService, formatEventPrice } from '../../../../core/events/events.service';
import {
  EventRegistrationRow,
  EventRegistrationsService,
} from '../../../../core/events/event-registrations.service';
import { UserProfileService } from '../../../../core/users/user-profile.service';
import { BackLinkComponent } from '../../components/back-link/back-link.component';
import { ConfirmDialogComponent } from '../../components/confirm-dialog/confirm-dialog.component';
import {
  EventFormDialogComponent,
  EventFormDialogState,
  EventFormMode,
} from '../../components/event-form-dialog/event-form-dialog.component';
import { dateBlockParts, formatLongDate } from '../../components/date-format';

@Component({
  selector: 'app-gestione-eventi',
  standalone: true,
  imports: [CommonModule, BackLinkComponent, EventFormDialogComponent, ConfirmDialogComponent],
  templateUrl: './gestione-eventi.component.html',
  styleUrl: './gestione-eventi.component.scss',
})
export class GestioneEventiComponent implements OnInit {
  private readonly eventsService = inject(EventsService);
  private readonly registrationsService = inject(EventRegistrationsService);
  private readonly profileService = inject(UserProfileService);

  readonly formatDate = formatLongDate;
  readonly dateBlock = dateBlockParts;
  readonly priceLabel = formatEventPrice;

  readonly events = signal<EventRow[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly infoMessage = signal<string | null>(null);

  // Un assistente vede la pagina (RLS già lo permette) ma non può scrivere:
  // le RPC respingono comunque chi non è trainer/admin, questo è solo per
  // non mostrargli controlli che gli verrebbero respinti — stesso principio
  // di gestione-lezioni.component.ts.
  readonly canAct = signal(false);

  // --- Modale "Nuovo evento" / "Modifica evento" ---
  readonly formOpen = signal(false);
  readonly formMode = signal<EventFormMode>('create');
  readonly editingEvent = signal<EventRow | null>(null);
  readonly formState = signal<EventFormDialogState>('form');
  readonly formBusy = signal(false);
  readonly formError = signal<string | null>(null);

  // --- Conferma "Cancella evento" ---
  readonly deletingEvent = signal<EventRow | null>(null);
  readonly deleteBusy = signal(false);
  readonly deleteError = signal<string | null>(null);

  // --- Iscritti: espansi per evento, caricati on-demand ---
  readonly expandedEventId = signal<number | null>(null);
  readonly registrationsByEvent = signal<Record<number, EventRegistrationRow[]>>({});
  readonly loadingRegistrations = signal(false);

  // --- Conferma "Rimuovi iscritto" ---
  readonly removingRegistration = signal<EventRegistrationRow | null>(null);
  readonly removeBusy = signal(false);
  readonly removeError = signal<string | null>(null);

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
      this.events.set(await this.eventsService.listUpcoming());
    } catch {
      this.errorMessage.set('Errore nel caricamento degli eventi.');
    } finally {
      this.loading.set(false);
    }
  }

  postiLabel(event: EventRow): string {
    return event.max_customers === null
      ? `${event.active_registrations} iscritti`
      : `${event.active_registrations}/${event.max_customers} iscritti`;
  }

  /** Iscritti totali sugli eventi in programma, per il riepilogo in testa. */
  totalRegistrations(): number {
    return this.events().reduce((sum, e) => sum + e.active_registrations, 0);
  }

  isFull(event: EventRow): boolean {
    return event.max_customers !== null && event.active_registrations >= event.max_customers;
  }

  /** Riempimento della barra dei posti, 0–100. */
  fillPercent(event: EventRow): number {
    if (event.max_customers === null || event.max_customers === 0) return 0;
    return Math.min(100, Math.round((event.active_registrations / event.max_customers) * 100));
  }

  // --- "Nuovo evento" / "Modifica evento" ---

  openCreate(): void {
    this.formMode.set('create');
    this.editingEvent.set(null);
    this.formState.set('form');
    this.formError.set(null);
    this.formOpen.set(true);
  }

  openEdit(event: EventRow): void {
    this.formMode.set('edit');
    this.editingEvent.set(event);
    this.formState.set('form');
    this.formError.set(null);
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.formOpen.set(false);
  }

  async submitForm(value: EventInput): Promise<void> {
    this.formBusy.set(true);
    this.formError.set(null);
    try {
      if (this.formMode() === 'create') {
        await this.eventsService.create(value);
      } else {
        const event = this.editingEvent();
        if (!event) return;
        await this.eventsService.update(event.id, value);
      }
      this.formState.set('success');
      await this.load();
    } catch (err) {
      this.formError.set(errorText(err) ?? 'Salvataggio non riuscito.');
    } finally {
      this.formBusy.set(false);
    }
  }

  // --- "Cancella evento" ---

  openDelete(event: EventRow): void {
    this.deletingEvent.set(event);
    this.deleteError.set(null);
  }

  closeDelete(): void {
    this.deletingEvent.set(null);
  }

  async confirmDelete(reason: string): Promise<void> {
    const event = this.deletingEvent();
    if (!event) return;

    this.deleteBusy.set(true);
    this.deleteError.set(null);
    try {
      await this.eventsService.delete(event.id, reason);
      this.deletingEvent.set(null);
      this.infoMessage.set(
        event.active_registrations > 0
          ? 'Evento cancellato. Gli iscritti hanno ricevuto un\'email di avviso.'
          : 'Evento cancellato.'
      );
      await this.load();
    } catch (err) {
      this.deleteError.set(errorText(err) ?? 'Cancellazione non riuscita.');
    } finally {
      this.deleteBusy.set(false);
    }
  }

  // --- Iscritti ---

  async toggleRegistrations(event: EventRow): Promise<void> {
    if (this.expandedEventId() === event.id) {
      this.expandedEventId.set(null);
      return;
    }
    this.expandedEventId.set(event.id);
    if (this.registrationsByEvent()[event.id]) {
      return;
    }
    this.loadingRegistrations.set(true);
    try {
      const rows = await this.registrationsService.listForEvent(event.id);
      this.registrationsByEvent.update((map) => ({ ...map, [event.id]: rows }));
    } catch {
      this.errorMessage.set('Errore nel caricamento degli iscritti.');
    } finally {
      this.loadingRegistrations.set(false);
    }
  }

  registrationsFor(eventId: number): EventRegistrationRow[] {
    return this.registrationsByEvent()[eventId] ?? [];
  }

  customerLabel(reg: EventRegistrationRow): string {
    const dog = reg.customer_dog_name ? ` (${reg.customer_dog_name})` : '';
    return `${reg.customer_name} ${reg.customer_surname}${dog}`;
  }

  // --- "Rimuovi iscritto" ---

  openRemove(reg: EventRegistrationRow): void {
    this.removingRegistration.set(reg);
    this.removeError.set(null);
  }

  closeRemove(): void {
    this.removingRegistration.set(null);
  }

  async confirmRemove(note: string): Promise<void> {
    const reg = this.removingRegistration();
    if (!reg) return;

    this.removeBusy.set(true);
    this.removeError.set(null);
    try {
      await this.registrationsService.adminRemove(reg.id, note);
      this.removingRegistration.set(null);
      this.infoMessage.set('Iscritto rimosso.');
      this.registrationsByEvent.update((map) => ({
        ...map,
        [reg.event_id]: (map[reg.event_id] ?? []).filter((r) => r.id !== reg.id),
      }));
      await this.load();
    } catch (err) {
      this.removeError.set(errorText(err) ?? 'Rimozione non riuscita.');
    } finally {
      this.removeBusy.set(false);
    }
  }
}

function errorText(err: unknown): string | null {
  return (err as { message?: string } | null)?.message ?? null;
}
