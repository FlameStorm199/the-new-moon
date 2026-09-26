import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  computed,
  signal,
} from '@angular/core';
import { EventRow } from '../../../../core/events/events.service';
import { SlotRow } from '../../../../core/slots/slots.service';

/**
 * Posizione orizzontale dentro la colonna del giorno, quando due blocchi si
 * sovrappongono nel tempo (tipicamente un evento sopra uno slot): null se il
 * blocco è solo e prende tutta la larghezza.
 */
interface LanePosition {
  width: string | null;
  offset: string | null;
}

interface PositionedSlot extends LanePosition {
  slot: SlotRow;
  rowStart: number;
  rowEnd: number;
  flagged: boolean;
  /** Separati e non "09:00–09:55": affiancati non stanno in una colonna. */
  timeFrom: string;
  timeTo: string;
}

interface PositionedEvent extends LanePosition {
  event: EventRow;
  rowStart: number;
  rowEnd: number;
  timeFrom: string;
  registered: boolean;
  full: boolean;
}

interface CalendarDay {
  date: string;
  weekdayLabel: string;
  dayLabel: string;
  isToday: boolean;
  slots: PositionedSlot[];
  events: PositionedEvent[];
}

interface HourLine {
  label: string;
  rowStart: number;
}

/** Fascia oraria saltata perché senza slot nei giorni mostrati. */
interface GapBand {
  label: string;
  rowStart: number;
  rows: number;
}

const WEEKDAY_LABELS = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const MONTH_LABELS = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];

/**
 * Una riga di griglia = 5 minuti. Non 15: gli slot durano 55 minuti (durata
 * 55' o 60' meno la pausa), e su righe da un quarto d'ora un blocco
 * 09:00–09:55 finirebbe a riga 4,67 — frazionaria, quindi ignorata dal
 * browser, che collassava il blocco a un'altezza minima.
 */
const ROW_MINUTES = 5;
const ROWS_PER_HOUR = 60 / ROW_MINUTES;

/** Altezza della banda che sostituisce le ore senza slot. */
const GAP_ROWS = 4;

/** Ore mostrate quando l'intervallo è vuoto, per non avere una griglia a zero righe. */
const FALLBACK_HOURS = [9, 10, 11];

/**
 * Sotto questa larghezza si passa da 7 a 3 giorni. Sette colonne su un
 * telefono in verticale (~390px, meno i margini della pagina) darebbero
 * ~36px l'una, dove un orario ne chiede da solo ~34: con tre colonne se ne
 * hanno ~85 e la griglia resta leggibile. Il valore vive qui e non nel SCSS
 * perché il numero di colonne è una scelta di struttura, non di stile: il
 * CSS può ridimensionare le colonne, non toglierne quattro dal DOM.
 */
const NARROW_MAX_WIDTH = 600;
const DAYS_WIDE = 7;
const DAYS_NARROW = 3;

/**
 * Vista ad agenda: i giorni sono colonne, le ore righe, e ogni slot libero è
 * un blocco cliccabile posizionato sul suo orario reale.
 *
 * Mostra una settimana intera sugli schermi larghi e tre giorni su quelli
 * stretti, avanzando di conseguenza — come fanno le agende sul telefono.
 *
 * Riceve gli slot già filtrati da chi la usa (la pagina di prenotazione
 * toglie quelli sotto la finestra minima per i clienti): qui dentro non
 * vivono regole di business, solo posizionamento e navigazione.
 *
 * Facoltativamente mostra anche gli eventi (blocchi viola, cliccabili per
 * dettagli e iscrizione): chi non passa l'input `events` vede il calendario
 * di soli slot di sempre.
 *
 * Le ore in cui non esiste alcuno slot nei giorni mostrati non vengono
 * disegnate a grandezza naturale ma compresse in una banda: con apertura
 * mattutina e serale, un asse continuo 9→20 sarebbe per metà vuoto.
 */
@Component({
  selector: 'app-week-calendar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './week-calendar.component.html',
  styleUrl: './week-calendar.component.scss',
})
export class WeekCalendarComponent implements OnDestroy {
  private readonly allSlots = signal<SlotRow[]>([]);
  private readonly allEvents = signal<EventRow[]>([]);
  private readonly flaggedIds = signal<ReadonlySet<number>>(new Set());

  /** 7 su schermo largo, 3 su schermo stretto. */
  readonly daysToShow = signal(DAYS_WIDE);

  /** Primo giorno mostrato. Con 7 giorni è sempre un lunedì. */
  private readonly rangeStart = signal<Date>(startOfWeek(new Date()));

  private readonly mediaQuery: MediaQueryList | null;
  private readonly onViewportChange = (event: MediaQueryListEvent) =>
    this.applyViewport(event.matches);

  constructor() {
    // matchMedia invece di un listener su resize: notifica solo quando si
    // attraversa davvero la soglia, non a ogni pixel di ridimensionamento.
    this.mediaQuery =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia(`(max-width: ${NARROW_MAX_WIDTH}px)`)
        : null;

    if (this.mediaQuery) {
      this.applyViewport(this.mediaQuery.matches);
      this.mediaQuery.addEventListener('change', this.onViewportChange);
    }
  }

  ngOnDestroy(): void {
    this.mediaQuery?.removeEventListener('change', this.onViewportChange);
  }

  @Input({ required: true })
  set slots(value: SlotRow[]) {
    this.allSlots.set(value ?? []);
    this.ensureRangeWithSlots();
  }

  /**
   * Slot da contrassegnare (per lo staff: quelli dentro la finestra in cui
   * un cliente non potrebbe prenotare). Array e non Set per comodità di chi
   * chiama; convertito qui una volta sola.
   */
  @Input()
  set flaggedSlotIds(value: number[]) {
    this.flaggedIds.set(new Set(value ?? []));
  }

  @Input()
  set events(value: EventRow[]) {
    this.allEvents.set(value ?? []);
    this.ensureRangeWithSlots();
  }

  /** Per mostrare la legenda solo quando nel calendario c'è più di un tipo di blocco. */
  readonly hasEvents = computed(() => this.allEvents().length > 0);

  /** Tenuta corta: nel blocco convive con l'orario, in pochi pixel. */
  @Input() flaggedLabel = '< finestra';

  /** Slot su cui è in corso la prenotazione, per bloccarne il bottone. */
  @Input() busySlotId: number | null = null;

  @Output() readonly slotSelected = new EventEmitter<SlotRow>();
  @Output() readonly eventSelected = new EventEmitter<EventRow>();

  private readonly slotsByDate = computed(() => {
    const map = new Map<string, SlotRow[]>();
    for (const slot of this.allSlots()) {
      const list = map.get(slot.date) ?? [];
      list.push(slot);
      map.set(slot.date, list);
    }
    return map;
  });

  private readonly eventsByDate = computed(() => {
    const map = new Map<string, EventRow[]>();
    for (const event of this.allEvents()) {
      const list = map.get(event.date) ?? [];
      list.push(event);
      map.set(event.date, list);
    }
    return map;
  });

  private readonly visibleDates = computed(() => {
    const start = this.rangeStart();
    return Array.from({ length: this.daysToShow() }, (_, i) => addDays(start, i));
  });

  /** Slot ed eventi dei giorni mostrati: per l'asse orario servono solo gli orari. */
  private readonly itemsInRange = computed(() => {
    const slots = this.slotsByDate();
    const events = this.eventsByDate();
    return this.visibleDates().flatMap((date) => {
      const iso = toIsoDate(date);
      return [...(slots.get(iso) ?? []), ...(events.get(iso) ?? [])];
    });
  });

  /**
   * Disposizione verticale: quali ore disegnare, a che riga inizia ciascuna,
   * e dove cadono le bande che sostituiscono le ore vuote. Tutto il
   * posizionamento passa di qui, così griglia, righe orarie e blocchi non
   * possono scivolare l'uno rispetto all'altro.
   */
  private readonly layout = computed(() => {
    const hours = new Set<number>();
    for (const item of this.itemsInRange()) {
      const from = toMinutes(item.time_from);
      const to = toMinutes(item.time_to);
      // -1 sul minuto finale: uno slot che termina alle 12:00 occupa fino
      // alle 11, non introduce l'ora delle 12.
      for (let h = Math.floor(from / 60); h <= Math.floor((to - 1) / 60); h++) {
        hours.add(h);
      }
    }
    const sorted = hours.size > 0 ? Array.from(hours).sort((a, b) => a - b) : FALLBACK_HOURS;

    const rowByHour = new Map<number, number>();
    const hourLines: HourLine[] = [];
    const gaps: GapBand[] = [];
    let cursor = 1;

    sorted.forEach((hour, index) => {
      rowByHour.set(hour, cursor);
      hourLines.push({ label: `${pad(hour)}:00`, rowStart: cursor });
      cursor += ROWS_PER_HOUR;

      const next = sorted[index + 1];
      if (next !== undefined && next !== hour + 1) {
        gaps.push({
          label: `${pad(hour + 1)}:00 – ${pad(next)}:00`,
          rowStart: cursor,
          rows: GAP_ROWS,
        });
        cursor += GAP_ROWS;
      }
    });

    return { rowByHour, hourLines, gaps, totalRows: cursor - 1 };
  });

  readonly hourLines = computed(() => this.layout().hourLines);
  readonly gaps = computed(() => this.layout().gaps);

  /**
   * Legate a proprietà CSS standard invece che a una custom property
   * (`[style.--qualcosa]`), il cui supporto nel binding di Angular non è
   * stato uniforme tra le versioni: l'altezza riga resta nel SCSS come
   * var(--row-h), qui viaggia solo il numero di righe.
   */
  readonly gridRowsStyle = computed(() => `repeat(${this.layout().totalRows}, var(--row-h))`);
  readonly dayColumnRowStyle = computed(() => `1 / span ${this.layout().totalRows}`);

  readonly days = computed<CalendarDay[]>(() => {
    const todayIso = toIsoDate(new Date());
    const byDate = this.slotsByDate();
    const eventsByDate = this.eventsByDate();
    const flagged = this.flaggedIds();
    const { rowByHour } = this.layout();

    return this.visibleDates().map((date) => {
      const iso = toIsoDate(date);
      const daySlots = byDate.get(iso) ?? [];
      const dayEvents = eventsByDate.get(iso) ?? [];
      const lanes = assignLanes([...daySlots, ...dayEvents]);

      return {
        date: iso,
        weekdayLabel: WEEKDAY_LABELS[date.getDay()],
        dayLabel: String(date.getDate()),
        isToday: iso === todayIso,
        slots: daySlots.map((slot) => ({
          slot,
          rowStart: startRow(toMinutes(slot.time_from), rowByHour),
          rowEnd: endRow(toMinutes(slot.time_to), rowByHour),
          flagged: flagged.has(slot.id),
          timeFrom: slot.time_from.slice(0, 5),
          timeTo: slot.time_to.slice(0, 5),
          ...lanes.get(slot)!,
        })),
        events: dayEvents.map((event) => ({
          event,
          rowStart: startRow(toMinutes(event.time_from), rowByHour),
          rowEnd: endRow(toMinutes(event.time_to), rowByHour),
          timeFrom: event.time_from.slice(0, 5),
          registered: event.my_registration_id !== null,
          full: event.max_customers !== null && event.active_registrations >= event.max_customers,
          ...lanes.get(event)!,
        })),
      };
    });
  });

  readonly rangeLabel = computed(() => {
    const dates = this.visibleDates();
    const start = dates[0];
    const end = dates[dates.length - 1];
    const startMonth = MONTH_LABELS[start.getMonth()];
    const endMonth = MONTH_LABELS[end.getMonth()];
    if (startMonth === endMonth) {
      return `${start.getDate()}–${end.getDate()} ${endMonth} ${end.getFullYear()}`;
    }
    return `${start.getDate()} ${startMonth} – ${end.getDate()} ${endMonth} ${end.getFullYear()}`;
  });

  readonly hasSlotsInRange = computed(() => this.itemsInRange().length > 0);

  /** Giorni con qualcosa da mostrare (slot o eventi): guidano la navigazione. */
  private readonly slotDates = computed(() =>
    Array.from(
      new Set([...this.allSlots(), ...this.allEvents()].map((item) => item.date))
    ).sort()
  );

  readonly canGoPrevious = computed(() => {
    const dates = this.slotDates();
    return dates.length > 0 && dates[0] < toIsoDate(this.rangeStart());
  });

  readonly canGoNext = computed(() => {
    const dates = this.slotDates();
    const lastVisible = toIsoDate(this.visibleDates()[this.visibleDates().length - 1]);
    return dates.length > 0 && dates[dates.length - 1] > lastVisible;
  });

  previous(): void {
    if (this.canGoPrevious()) {
      this.rangeStart.set(addDays(this.rangeStart(), -this.daysToShow()));
    }
  }

  next(): void {
    if (this.canGoNext()) {
      this.rangeStart.set(addDays(this.rangeStart(), this.daysToShow()));
    }
  }

  select(slot: SlotRow): void {
    this.slotSelected.emit(slot);
  }

  selectEvent(event: EventRow): void {
    this.eventSelected.emit(event);
  }

  private applyViewport(isNarrow: boolean): void {
    const count = isNarrow ? DAYS_NARROW : DAYS_WIDE;
    if (count === this.daysToShow()) {
      return;
    }
    this.daysToShow.set(count);
    // Passando a 7 giorni l'inizio deve tornare su un lunedì, altrimenti la
    // griglia mostrerebbe una "settimana" che parte da un giorno qualsiasi.
    this.rangeStart.set(this.alignStart(this.rangeStart()));
    this.ensureRangeWithSlots();
  }

  private alignStart(date: Date): Date {
    return this.daysToShow() === DAYS_WIDE ? startOfWeek(date) : date;
  }

  /**
   * All'arrivo di nuovi slot (o al cambio di vista), apre il primo
   * intervallo che ne contiene invece di restare su uno vuoto: con la
   * finestra minima di prenotazione i primi giorni sono spesso senza
   * disponibilità, e una griglia deserta farebbe pensare che non ce ne sia.
   */
  private ensureRangeWithSlots(): void {
    const dates = this.slotDates();
    if (dates.length === 0 || this.hasSlotsInRange()) {
      return;
    }
    const currentIso = toIsoDate(this.rangeStart());
    const target = dates.find((date) => date >= currentIso) ?? dates[0];
    this.rangeStart.set(this.alignStart(parseIsoDate(target)));
  }
}

/**
 * Affianca i blocchi dello stesso giorno che si sovrappongono nel tempo.
 * Raggruppa quelli che si toccano (anche a catena) e dentro ogni gruppo dà
 * a ciascuno la prima corsia libera: larghezza e scostamento dipendono dal
 * gruppo, così un evento sovrapposto a uno slot stringe solo quei due e non
 * tutta la giornata.
 */
function assignLanes<T extends { time_from: string; time_to: string }>(
  items: T[]
): Map<T, LanePosition> {
  const result = new Map<T, LanePosition>();
  const sorted = items
    .slice()
    .sort((a, b) => toMinutes(a.time_from) - toMinutes(b.time_from));

  let group: { item: T; lane: number }[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -1;

  const flush = () => {
    const lanes = laneEnds.length;
    for (const { item, lane } of group) {
      result.set(
        item,
        lanes > 1
          ? {
              width: `calc(${100 / lanes}% - 4px)`,
              offset: `calc(${(lane * 100) / lanes}% + 2px)`,
            }
          : { width: null, offset: null }
      );
    }
    group = [];
    laneEnds = [];
  };

  for (const item of sorted) {
    const from = toMinutes(item.time_from);
    const to = toMinutes(item.time_to);
    if (from >= groupEnd) {
      flush();
    }
    let lane = laneEnds.findIndex((end) => end <= from);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(to);
    } else {
      laneEnds[lane] = to;
    }
    group.push({ item, lane });
    groupEnd = Math.max(groupEnd, to);
  }
  flush();

  return result;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/** Riga di inizio: l'ora del minuto indicato, più i minuti dentro l'ora. */
function startRow(minutes: number, rowByHour: Map<number, number>): number {
  const hourRow = rowByHour.get(Math.floor(minutes / 60)) ?? 1;
  return hourRow + Math.round((minutes % 60) / ROW_MINUTES);
}

/**
 * Riga di fine (esclusiva). Si ancora all'ora del minuto PRECEDENTE la fine:
 * uno slot che termina alle 12:00 va agganciato alla banda delle 11, che
 * esiste di sicuro, non a quella delle 12, che potrebbe non essere
 * disegnata perché priva di slot.
 */
function endRow(minutes: number, rowByHour: Map<number, number>): number {
  const anchorHour = Math.floor((minutes - 1) / 60);
  const hourRow = rowByHour.get(anchorHour) ?? 1;
  return hourRow + Math.round((minutes - anchorHour * 60) / ROW_MINUTES);
}

/** Lunedì della settimana che contiene `date`, a mezzanotte locale. */
function startOfWeek(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // getDay(): 0 = domenica. Portato a settimana che inizia di lunedì.
  const offset = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - offset);
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Data locale in formato YYYY-MM-DD. Non si usa toISOString(), che converte
 * in UTC: in Italia (UTC+1/+2) restituirebbe il giorno precedente per le ore
 * dopo mezzanotte, disallineando il calendario dalle date degli slot.
 */
function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}
