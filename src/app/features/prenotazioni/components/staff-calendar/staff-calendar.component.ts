import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, Output, computed, signal } from '@angular/core';
import { ClosedDay, PartOfDay, SlotRow } from '../../../../core/slots/slots.service';
import { LessonRow } from '../../../../core/lessons/lessons.service';

interface PositionedSlot {
  slot: SlotRow;
  rowStart: number;
  rowEnd: number;
  occupied: boolean;
  /** Solo se occupied: la lezione da mostrare nel dettaglio al click. */
  lesson: LessonRow | null;
  timeFrom: string;
  /** Orario di fine se libero, "Disattivo" se disattivato, breve info sul cliente se prenotato. */
  secondLine: string;
}

/** Fascia di chiusura, posizionata come uno slot qualunque sulle stesse righe. */
interface ClosedBand {
  rowStart: number;
  rowEnd: number;
  label: string;
  reason: string | null;
}

interface CalendarDay {
  date: string;
  weekdayLabel: string;
  dayLabel: string;
  isToday: boolean;
  /** Al più due (mattina e/o pomeriggio): per una giornata intera compaiono entrambe. */
  closedBands: ClosedBand[];
  slots: PositionedSlot[];
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

const ACTIVE_LESSON_STATUSES = new Set(['pending', 'confirmed']);

/** Vedi week-calendar.component.ts: stessa scelta, stessa motivazione. */
const ROW_MINUTES = 5;
const ROWS_PER_HOUR = 60 / ROW_MINUTES;
const GAP_ROWS = 4;

/** Ore mostrate quando l'intervallo è vuoto, per non avere una griglia a zero righe. */
const FALLBACK_HOURS = [9, 10, 11];

const NARROW_MAX_WIDTH = 600;
const DAYS_WIDE = 7;
const DAYS_NARROW = 3;

const MATTINA_LABEL = 'Chiuso mattina';
const POMERIGGIO_LABEL = 'Chiuso pomeriggio';

/**
 * Calendario staff, sola lettura: stessa vista ad agenda e stessa
 * navigazione a frecce del calendario di prenotazione (l'asse orario si
 * adatta agli slot davvero presenti, comprimendo le ore vuote come lì), ma
 * qui le frecce scorrono sempre — non solo dove esistono slot: allo staff
 * serve poter guardare avanti o indietro liberamente, anche una settimana
 * vuota o interamente chiusa. In più mostra sempre i propri slot (liberi in
 * blu), quelli occupati (verdi, con chi ha prenotato) e le giornate/mezze
 * giornate chiuse (arancio: solo la parte prima della pausa se è la mattina
 * a essere chiusa, solo quella dopo se è il pomeriggio) e gli slot
 * disattivati (grigi). Clic su uno slot libero o disattivato lo attiva o
 * disattiva; clic su uno occupato apre il dettaglio della lezione (a
 * carico di chi usa il componente, tramite lessonOpen).
 */
@Component({
  selector: 'app-staff-calendar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './staff-calendar.component.html',
  styleUrl: './staff-calendar.component.scss',
})
export class StaffCalendarComponent implements OnDestroy {
  private readonly allSlots = signal<SlotRow[]>([]);
  private readonly allLessons = signal<LessonRow[]>([]);
  private readonly allClosedDays = signal<ClosedDay[]>([]);

  readonly daysToShow = signal(DAYS_WIDE);
  private readonly rangeStart = signal<Date>(startOfWeek(new Date()));

  private readonly mediaQuery: MediaQueryList | null;
  private readonly onViewportChange = (event: MediaQueryListEvent) =>
    this.applyViewport(event.matches);

  constructor() {
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
  }

  @Input()
  set lessons(value: LessonRow[]) {
    this.allLessons.set(value ?? []);
  }

  @Input()
  set closedDays(value: ClosedDay[]) {
    this.allClosedDays.set(value ?? []);
  }

  /** Slot il cui toggle attivo/disattivo è in corso: disabilitato mentre risponde al server. */
  @Input() togglingSlotId: number | null = null;

  /**
   * false per chi vede il calendario in sola lettura (l'assistente: le RLS
   * gli permettono di leggere ma non di scrivere, come nelle altre pagine
   * staff). Il dettaglio di una lezione resta comunque apribile: è solo
   * consultazione, non una scrittura.
   */
  @Input() canToggle = true;

  /** Slot libero o disattivato cliccato: chi usa il componente decide se e come attivarlo/disattivarlo. */
  @Output() readonly slotToggle = new EventEmitter<SlotRow>();
  /** Slot occupato cliccato: la lezione da mostrare, per aprirne il dettaglio. */
  @Output() readonly lessonOpen = new EventEmitter<LessonRow>();

  private readonly slotsByDate = computed(() => {
    const map = new Map<string, SlotRow[]>();
    for (const slot of this.allSlots()) {
      const list = map.get(slot.date) ?? [];
      list.push(slot);
      map.set(slot.date, list);
    }
    return map;
  });

  /** Prenotazione attiva per slot: solo per etichettare i blocchi occupati. */
  private readonly lessonBySlotId = computed(() => {
    const map = new Map<number, LessonRow>();
    for (const lesson of this.allLessons()) {
      if (lesson.slot_id !== null && ACTIVE_LESSON_STATUSES.has(lesson.status)) {
        map.set(lesson.slot_id, lesson);
      }
    }
    return map;
  });

  private readonly closedByDate = computed(() => {
    const map = new Map<string, ClosedDay[]>();
    for (const day of this.allClosedDays()) {
      const list = map.get(day.date) ?? [];
      list.push(day);
      map.set(day.date, list);
    }
    return map;
  });

  private readonly visibleDates = computed(() => {
    const start = this.rangeStart();
    return Array.from({ length: this.daysToShow() }, (_, i) => addDays(start, i));
  });

  private readonly slotsInRange = computed(() => {
    const byDate = this.slotsByDate();
    return this.visibleDates().flatMap((date) => byDate.get(toIsoDate(date)) ?? []);
  });

  private readonly layout = computed(() => buildLayout(this.slotsInRange()));

  readonly hourLines = computed(() => this.layout().hourLines);
  readonly gaps = computed(() => this.layout().gaps);
  readonly gridRowsStyle = computed(() => `repeat(${this.layout().totalRows}, var(--row-h))`);
  readonly dayColumnRowStyle = computed(() => `1 / span ${this.layout().totalRows}`);

  readonly days = computed<CalendarDay[]>(() => {
    const todayIso = toIsoDate(new Date());
    const byDate = this.slotsByDate();
    const lessonBySlot = this.lessonBySlotId();
    const closedByDate = this.closedByDate();
    const { rowByHour, totalRows, morningEndRow, afternoonStartRow } = this.layout();

    // Confine fra "prima" e "dopo" la pausa: dove finiscono davvero le ore
    // di mattina in questo intervallo di giorni, o dove iniziano quelle di
    // pomeriggio — quale dei due è noto, in mancanza dell'altro.
    const morningBandEnd = morningEndRow ?? afternoonStartRow ?? totalRows + 1;
    const afternoonBandStart = afternoonStartRow ?? morningEndRow ?? 1;

    return this.visibleDates().map((date) => {
      const iso = toIsoDate(date);
      const daySlots = (byDate.get(iso) ?? [])
        .slice()
        .sort((a, b) => a.time_from.localeCompare(b.time_from));

      const closedRows = closedByDate.get(iso) ?? [];
      const giornataRow = closedRows.find((r) => r.part_of_day === 'giornata');
      const mattinaRow = closedRows.find((r) => r.part_of_day === 'mattina');
      const pomeriggioRow = closedRows.find((r) => r.part_of_day === 'pomeriggio');

      const closedBands: ClosedBand[] = [];
      if (giornataRow || mattinaRow) {
        closedBands.push({
          rowStart: 1,
          rowEnd: morningBandEnd,
          label: MATTINA_LABEL,
          reason: (mattinaRow ?? giornataRow)?.reason ?? null,
        });
      }
      if (giornataRow || pomeriggioRow) {
        closedBands.push({
          rowStart: afternoonBandStart,
          rowEnd: totalRows + 1,
          label: POMERIGGIO_LABEL,
          reason: (pomeriggioRow ?? giornataRow)?.reason ?? null,
        });
      }

      return {
        date: iso,
        weekdayLabel: WEEKDAY_LABELS[date.getDay()],
        dayLabel: String(date.getDate()),
        isToday: iso === todayIso,
        closedBands,
        slots: daySlots.map((slot) => {
          const lesson = slot.occupied ? lessonBySlot.get(slot.id) ?? null : null;
          return {
            slot,
            rowStart: startRow(toMinutes(slot.time_from), rowByHour),
            rowEnd: endRow(toMinutes(slot.time_to), rowByHour),
            occupied: slot.occupied,
            lesson,
            timeFrom: slot.time_from.slice(0, 5),
            secondLine: slot.occupied
              ? bookingLabel(lesson) ?? 'Prenotato'
              : slot.active
                ? slot.time_to.slice(0, 5)
                : 'Disattivo',
          };
        }),
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

  /**
   * A differenza del calendario di prenotazione, qui le frecce non sono mai
   * disattivate: allo staff serve poter scorrere liberamente avanti e
   * indietro, anche su settimane senza uno slot (es. per controllare una
   * chiusura lontana nel tempo).
   */
  previous(): void {
    this.rangeStart.set(addDays(this.rangeStart(), -this.daysToShow()));
  }

  next(): void {
    this.rangeStart.set(addDays(this.rangeStart(), this.daysToShow()));
  }

  /**
   * Occupato: apre il dettaglio della lezione, non tocca active (uno slot
   * con una lezione non si disattiva con un clic). Libero o disattivato:
   * l'unica cosa che un clic può fare è invertirne l'attivazione.
   */
  onSlotClick(item: PositionedSlot): void {
    if (item.occupied) {
      if (item.lesson) {
        this.lessonOpen.emit(item.lesson);
      }
      return;
    }
    if (this.canToggle) {
      this.slotToggle.emit(item.slot);
    }
  }

  private applyViewport(isNarrow: boolean): void {
    const count = isNarrow ? DAYS_NARROW : DAYS_WIDE;
    if (count === this.daysToShow()) {
      return;
    }
    this.daysToShow.set(count);
    this.rangeStart.set(this.alignStart(this.rangeStart()));
  }

  private alignStart(date: Date): Date {
    return this.daysToShow() === DAYS_WIDE ? startOfWeek(date) : date;
  }
}

function bookingLabel(lesson: LessonRow | null): string | null {
  if (!lesson) {
    return null;
  }
  return lesson.customer_dog_name || lesson.customer_name;
}

function buildLayout(slots: SlotRow[]): {
  rowByHour: Map<number, number>;
  hourLines: HourLine[];
  gaps: GapBand[];
  totalRows: number;
  /** Riga subito dopo l'ultima ora di mattina con almeno uno slot: null se in questo intervallo non ce n'è nessuna. */
  morningEndRow: number | null;
  /** Riga della prima ora di pomeriggio con almeno uno slot: null se in questo intervallo non ce n'è nessuna. */
  afternoonStartRow: number | null;
} {
  const hours = new Set<number>();
  const partByHour = new Map<number, PartOfDay>();
  for (const slot of slots) {
    const from = toMinutes(slot.time_from);
    const to = toMinutes(slot.time_to);
    for (let h = Math.floor(from / 60); h <= Math.floor((to - 1) / 60); h++) {
      hours.add(h);
      if (!partByHour.has(h)) {
        partByHour.set(h, slot.part_of_day);
      }
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

  const morningHours = sorted.filter((h) => partByHour.get(h) === 'mattina');
  const afternoonHours = sorted.filter((h) => partByHour.get(h) === 'pomeriggio');
  const lastMorningHour = morningHours.length > 0 ? Math.max(...morningHours) : null;
  const firstAfternoonHour = afternoonHours.length > 0 ? Math.min(...afternoonHours) : null;

  const morningEndRow =
    lastMorningHour !== null ? (rowByHour.get(lastMorningHour) ?? 0) + ROWS_PER_HOUR : null;
  const afternoonStartRow =
    firstAfternoonHour !== null ? rowByHour.get(firstAfternoonHour) ?? null : null;

  return { rowByHour, hourLines, gaps, totalRows: cursor - 1, morningEndRow, afternoonStartRow };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function startRow(minutes: number, rowByHour: Map<number, number>): number {
  const hourRow = rowByHour.get(Math.floor(minutes / 60)) ?? 1;
  return hourRow + Math.round((minutes % 60) / ROW_MINUTES);
}

function endRow(minutes: number, rowByHour: Map<number, number>): number {
  const anchorHour = Math.floor((minutes - 1) / 60);
  const hourRow = rowByHour.get(anchorHour) ?? 1;
  return hourRow + Math.round((minutes - anchorHour * 60) / ROW_MINUTES);
}

function startOfWeek(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - offset);
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() + days);
  return result;
}

function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
