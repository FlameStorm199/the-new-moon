import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BookingService } from '../../../../core/lessons/booking.service';
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
      this.slots.set(await this.slotsService.listAvailable(14));
    } catch {
      this.errorMessage.set('Errore nel caricamento degli slot disponibili.');
    } finally {
      this.loadingSlots.set(false);
    }
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
