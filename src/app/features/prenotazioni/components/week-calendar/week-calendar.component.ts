import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';
import { SlotRow } from '../../../../core/slots/slots.service';

interface PositionedSlot {
  slot: SlotRow;
  rowStart: number;
  rowEnd: number;
  flagged: boolean;
  /** Separati e non "09:00–09:55": affiancati non stanno in una colonna. */
  timeFrom: string;
  timeTo: string;
}

interface CalendarDay {
  date: string;
  weekdayLabel: string;
  dayLabel: string;
  isToday: boolean;
  slots: PositionedSlot[];
}

interface HourLine {
  label: string;
  rowStart: number;
}

/** Fascia oraria saltata perché senza slot in tutta la settimana. */
interface GapBand {
  label: string;
  rowStart: number;
  rows: number;
}

const WEEKDAY_LABELS = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
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

/** Ore mostrate quando la settimana è vuota, solo per non avere una griglia a zero righe. */
const FALLBACK_HOURS = [9, 10, 11];

/**
 * Vista settimanale in stile agenda: i giorni sono colonne, le ore righe, e
 * ogni slot libero è un blocco cliccabile posizionato sul suo orario reale.
 *
 * Riceve gli slot già filtrati da chi la usa (la pagina di prenotazione
 * toglie quelli sotto la finestra minima per i clienti): qui dentro non
 * vivono regole di business, solo posizionamento e navigazione.
 *
 * Le ore in cui non esiste alcuno slot in tutta la settimana non vengono
 * disegnate a grandezza naturale ma compresse in una banda: con apertura
 * mattutina e serale, un asse continuo 9→20 sarebbe per metà vuoto.
 *
 * Sotto i 720px la griglia diventa illeggibile su un telefono: la stessa
 * settimana viene quindi mostrata come elenco per giorno, alternata via CSS
 * (nessun listener di resize da tenere in vita).
 */
@Component({
  selector: 'app-week-calendar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './week-calendar.component.html',
  styleUrl: './week-calendar.component.scss',
})
export class WeekCalendarComponent {
  private readonly allSlots = signal<SlotRow[]>([]);
  private readonly flaggedIds = signal<ReadonlySet<number>>(new Set());

  @Input({ required: true })
  set slots(value: SlotRow[]) {
    this.allSlots.set(value ?? []);
    this.ensureWeekWithSlots();
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

  /** Tenuta corta: nel blocco convive con l'orario, in pochi pixel. */
  @Input() flaggedLabel = '< finestra';

  /** Slot su cui è in corso la prenotazione, per bloccarne il bottone. */
  @Input() busySlotId: number | null = null;

  @Output() readonly slotSelected = new EventEmitter<SlotRow>();

  /** Lunedì della settimana mostrata. */
  private readonly weekStart = signal<Date>(startOfWeek(new Date()));

  private readonly slotsByDate = computed(() => {
    const map = new Map<string, SlotRow[]>();
    for (const slot of this.allSlots()) {
      const list = map.get(slot.date) ?? [];
      list.push(slot);
      map.set(slot.date, list);
    }
    return map;
  });

  private readonly slotsThisWeek = computed(() => {
    const start = this.weekStart();
    const byDate = this.slotsByDate();
    const visible: SlotRow[] = [];
    for (let i = 0; i < 7; i++) {
      visible.push(...(byDate.get(toIsoDate(addDays(start, i))) ?? []));
    }
    return visible;
  });

  /**
   * Disposizione verticale della settimana: quali ore disegnare, a che riga
   * inizia ciascuna, e dove cadono le bande che sostituiscono le ore vuote.
   * Tutto il posizionamento passa di qui, così griglia, righe orarie e
   * blocchi non possono scivolare l'uno rispetto all'altro.
   */
  private readonly layout = computed(() => {
    const hours = new Set<number>();
    for (const slot of this.slotsThisWeek()) {
      const from = toMinutes(slot.time_from);
      const to = toMinutes(slot.time_to);
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
    const start = this.weekStart();
    const todayIso = toIsoDate(new Date());
    const byDate = this.slotsByDate();
    const flagged = this.flaggedIds();
    const { rowByHour } = this.layout();

    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(start, index);
      const iso = toIsoDate(date);
      const daySlots = (byDate.get(iso) ?? [])
        .slice()
        .sort((a, b) => a.time_from.localeCompare(b.time_from));

      return {
        date: iso,
        weekdayLabel: WEEKDAY_LABELS[index],
        dayLabel: String(date.getDate()),
        isToday: iso === todayIso,
        slots: daySlots.map((slot) => ({
          slot,
          rowStart: startRow(toMinutes(slot.time_from), rowByHour),
          rowEnd: endRow(toMinutes(slot.time_to), rowByHour),
          flagged: flagged.has(slot.id),
          timeFrom: slot.time_from.slice(0, 5),
          timeTo: slot.time_to.slice(0, 5),
        })),
      };
    });
  });

  readonly weekLabel = computed(() => {
    const start = this.weekStart();
    const end = addDays(start, 6);
    const startMonth = MONTH_LABELS[start.getMonth()];
    const endMonth = MONTH_LABELS[end.getMonth()];
    if (startMonth === endMonth) {
      return `${start.getDate()}–${end.getDate()} ${endMonth} ${end.getFullYear()}`;
    }
    return `${start.getDate()} ${startMonth} – ${end.getDate()} ${endMonth} ${end.getFullYear()}`;
  });

  readonly hasSlotsThisWeek = computed(() => this.slotsThisWeek().length > 0);

  /** Settimane raggiungibili: solo quelle in cui esistono davvero slot. */
  private readonly slotWeekStarts = computed(() => {
    const weeks = new Set<number>();
    for (const slot of this.allSlots()) {
      weeks.add(startOfWeek(parseIsoDate(slot.date)).getTime());
    }
    return Array.from(weeks).sort((a, b) => a - b);
  });

  readonly canGoPrevious = computed(() => {
    const weeks = this.slotWeekStarts();
    return weeks.length > 0 && this.weekStart().getTime() > weeks[0];
  });

  readonly canGoNext = computed(() => {
    const weeks = this.slotWeekStarts();
    return weeks.length > 0 && this.weekStart().getTime() < weeks[weeks.length - 1];
  });

  previousWeek(): void {
    if (this.canGoPrevious()) {
      this.weekStart.set(addDays(this.weekStart(), -7));
    }
  }

  nextWeek(): void {
    if (this.canGoNext()) {
      this.weekStart.set(addDays(this.weekStart(), 7));
    }
  }

  select(slot: SlotRow): void {
    this.slotSelected.emit(slot);
  }

  /**
   * All'arrivo di nuovi slot, apre la prima settimana che ne contiene invece
   * della corrente: con la finestra minima di prenotazione la settimana di
   * oggi è spesso vuota, e aprirla su una griglia deserta farebbe pensare che
   * non ci sia disponibilità.
   */
  private ensureWeekWithSlots(): void {
    const weeks = this.slotWeekStarts();
    if (weeks.length === 0) {
      return;
    }
    const current = this.weekStart().getTime();
    if (!weeks.includes(current)) {
      const next = weeks.find((w) => w >= current);
      this.weekStart.set(new Date(next ?? weeks[0]));
    }
  }
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
