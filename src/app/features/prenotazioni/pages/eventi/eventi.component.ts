import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { EventRow, EventsService, formatEventPrice } from '../../../../core/events/events.service';
import { EventRegistrationsService } from '../../../../core/events/event-registrations.service';
import { UserProfile, UserProfileService } from '../../../../core/users/user-profile.service';
import { BackLinkComponent } from '../../components/back-link/back-link.component';
import { ConfirmDialogComponent } from '../../components/confirm-dialog/confirm-dialog.component';
import { dateBlockParts, formatLongDate, formatTimeRange } from '../../components/date-format';

/** Sotto questa soglia i posti rimasti vengono segnalati: invita a non aspettare. */
const FEW_SEATS = 3;

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
  readonly formatTimeRange = formatTimeRange;
  readonly dateBlock = dateBlockParts;
  readonly priceLabel = formatEventPrice;

  readonly profile = signal<UserProfile | null>(null);
  readonly events = signal<EventRow[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly registeringId = signal<number | null>(null);
  /** Esito dell'ultima iscrizione/cancellazione, mostrato in cima. */
  readonly infoMessage = signal<string | null>(null);

  readonly myRegistrationsCount = computed(
    () => this.events().filter((e) => e.my_registration_id !== null).length
  );

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

  seatsLeft(event: EventRow): number | null {
    return event.max_customers === null
      ? null
      : Math.max(0, event.max_customers - event.active_registrations);
  }

  /** Solo quando i posti stanno finendo: con molti posti liberi è rumore. */
  fewSeatsLabel(event: EventRow): string | null {
    const left = this.seatsLeft(event);
    if (left === null || left === 0 || left > FEW_SEATS) return null;
    return left === 1 ? 'Ultimo posto' : `Ultimi ${left} posti`;
  }

  async register(event: EventRow): Promise<void> {
    this.registeringId.set(event.id);
    this.errorMessage.set(null);
    this.infoMessage.set(null);
    try {
      await this.registrationsService.register(event.id);
      this.infoMessage.set(`Sei iscritto/a a "${event.title}": ti abbiamo inviato un'email di riepilogo.`);
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
      this.infoMessage.set(`Iscrizione a "${event.title}" cancellata.`);
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
