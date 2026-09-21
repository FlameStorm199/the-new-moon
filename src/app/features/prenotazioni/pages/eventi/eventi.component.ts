import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { EventRow, EventsService } from '../../../../core/events/events.service';
import { EventRegistrationsService } from '../../../../core/events/event-registrations.service';
import { UserProfile, UserProfileService } from '../../../../core/users/user-profile.service';
import { BackLinkComponent } from '../../components/back-link/back-link.component';
import { ConfirmDialogComponent } from '../../components/confirm-dialog/confirm-dialog.component';
import { formatLongDate } from '../../components/date-format';

/**
 * Lista eventi + iscrizione/cancellazione self-service, per customer/
 * assistant/future_customer — stessi diritti del Customer sulla propria
 * iscrizione, vedi handoff_fase2.md. Nessun gate di validazione (a
 * differenza di prenota.component.ts): niente nel documento di design lo
 * richiede per gli eventi, e né la RLS di events né register_for_event lo
 * impongono (vedi database/31_fase2_events_registrations.sql).
 */
@Component({
  selector: 'app-eventi',
  standalone: true,
  imports: [CommonModule, BackLinkComponent, ConfirmDialogComponent],
  templateUrl: './eventi.component.html',
  styleUrl: './eventi.component.scss',
})
export class EventiComponent implements OnInit {
  private readonly eventsService = inject(EventsService);
  private readonly registrationsService = inject(EventRegistrationsService);
  private readonly profileService = inject(UserProfileService);

  readonly formatDate = formatLongDate;

  readonly profile = signal<UserProfile | null>(null);
  readonly events = signal<EventRow[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly registeringId = signal<number | null>(null);

  // --- Conferma "Cancella la mia iscrizione" ---
  readonly cancellingEvent = signal<EventRow | null>(null);
  readonly cancelBusy = signal(false);
  readonly cancelError = signal<string | null>(null);

  get canRegister(): boolean {
    const type = this.profile()?.typeCode;
    return type === 'customer' || type === 'assistant' || type === 'future_customer';
  }

  async ngOnInit(): Promise<void> {
    this.profile.set(await this.profileService.getMyProfile());
    await this.load();
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

  isFull(event: EventRow): boolean {
    return event.max_customers !== null && event.active_registrations >= event.max_customers;
  }

  postiLabel(event: EventRow): string | null {
    return event.max_customers === null
      ? null
      : `${event.active_registrations}/${event.max_customers} posti`;
  }

  async register(event: EventRow): Promise<void> {
    this.registeringId.set(event.id);
    this.errorMessage.set(null);
    try {
      await this.registrationsService.register(event.id);
      await this.load();
    } catch (err) {
      this.errorMessage.set(errorText(err) ?? 'Iscrizione non riuscita.');
    } finally {
      this.registeringId.set(null);
    }
  }

  openCancel(event: EventRow): void {
    this.cancellingEvent.set(event);
    this.cancelError.set(null);
  }

  closeCancel(): void {
    this.cancellingEvent.set(null);
  }

  async confirmCancel(): Promise<void> {
    const event = this.cancellingEvent();
    if (!event?.my_registration_id) return;

    this.cancelBusy.set(true);
    this.cancelError.set(null);
    try {
      await this.registrationsService.cancel(event.my_registration_id);
      this.cancellingEvent.set(null);
      await this.load();
    } catch (err) {
      this.cancelError.set(errorText(err) ?? 'Cancellazione non riuscita.');
    } finally {
      this.cancelBusy.set(false);
    }
  }
}

function errorText(err: unknown): string | null {
  return (err as { message?: string } | null)?.message ?? null;
}
