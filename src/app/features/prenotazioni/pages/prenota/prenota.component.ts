import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BookingService } from '../../../../core/lessons/booking.service';
import { LessonsService } from '../../../../core/lessons/lessons.service';
import { SlotRow, SlotsService } from '../../../../core/slots/slots.service';
import { UserProfile, UserProfileService } from '../../../../core/users/user-profile.service';

interface DayGroup {
  date: string;
  slots: SlotRow[];
}

@Component({
  selector: 'app-prenota',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './prenota.component.html',
  styleUrl: './prenota.component.scss',
})
export class PrenotaComponent implements OnInit {
  private readonly slotsService = inject(SlotsService);
  private readonly bookingService = inject(BookingService);
  private readonly profileService = inject(UserProfileService);
  private readonly lessonsService = inject(LessonsService);

  /** null finché non caricata: valore vero letto dal DB (getBookingSettings). */
  readonly bookingMinHours = signal<number | null>(null);

  readonly profile = signal<UserProfile | null>(null);
  readonly loadingProfile = signal(true);
  readonly slots = signal<SlotRow[]>([]);
  readonly loadingSlots = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly bookingId = signal<number | null>(null);

  readonly groupedByDate = computed<DayGroup[]>(() => {
    const groups = new Map<string, SlotRow[]>();
    for (const slot of this.slots()) {
      const list = groups.get(slot.date) ?? [];
      list.push(slot);
      groups.set(slot.date, list);
    }
    return Array.from(groups.entries()).map(([date, slots]) => ({ date, slots }));
  });

  get canBook(): boolean {
    const p = this.profile();
    if (!p) {
      return false;
    }
    return p.validated || p.typeCode === 'trainer' || p.typeCode === 'admin';
  }

  private get isStaff(): boolean {
    const type = this.profile()?.typeCode;
    return type === 'trainer' || type === 'admin';
  }

  async ngOnInit(): Promise<void> {
    this.profile.set(await this.profileService.getMyProfile());
    this.loadingProfile.set(false);
    if (this.canBook) {
      await this.loadSlots();
    }
  }

  async loadSlots(): Promise<void> {
    this.loadingSlots.set(true);
    this.errorMessage.set(null);
    try {
      const [slots, settings] = await Promise.all([
        this.slotsService.listAvailable(14),
        this.lessonsService.getBookingSettings(),
      ]);
      this.bookingMinHours.set(settings.bookingMinHoursBefore);
      // Lo staff bypassa la finestra minima anche lato server (book_lesson):
      // qui è lo stesso, non ha senso nascondergli slot che può comunque
      // prenotare. Per un customer invece uno slot dentro la finestra non
      // deve nemmeno comparire come opzione, non solo essere rifiutato al
      // click: coerente con la stessa regola già enforced in book_lesson.
      this.slots.set(
        this.isStaff
          ? slots
          : slots.filter((s) => this.isBookableNow(s, settings.bookingMinHoursBefore))
      );
    } catch {
      this.errorMessage.set('Errore nel caricamento degli slot disponibili.');
    } finally {
      this.loadingSlots.set(false);
    }
  }

  /**
   * Stessa soglia di book_lesson lato DB (booking_min_hours_before), qui
   * solo per non mostrare come opzione uno slot che verrebbe comunque
   * rifiutato al momento della prenotazione. Il controllo che conta resta
   * quello server-side: questo è solo UX.
   */
  private isBookableNow(slot: SlotRow, minHoursBefore: number): boolean {
    const slotStart = new Date(`${slot.date}T${slot.time_from}`);
    const threshold = new Date(Date.now() + minHoursBefore * 60 * 60 * 1000);
    return slotStart >= threshold;
  }

  async book(slot: SlotRow): Promise<void> {
    this.bookingId.set(slot.id);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    try {
      await this.bookingService.bookLesson(slot.id);
      this.successMessage.set('Lezione prenotata con successo!');
      this.slots.update((list) => list.filter((s) => s.id !== slot.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : null;
      this.errorMessage.set(message ?? 'Prenotazione non riuscita.');
    } finally {
      this.bookingId.set(null);
    }
  }
}
