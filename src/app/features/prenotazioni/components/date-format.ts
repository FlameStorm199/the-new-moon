const WEEKDAYS = [
  'domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato',
];
const MONTHS = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];

/**
 * "giovedì 3 settembre 2026" da una data ISO (YYYY-MM-DD). Formato esteso
 * unico per tutta l'app: usato sia nei modali di prenotazione/cancellazione
 * sia in "Le mie lezioni" (che include lo storico, dove l'anno non è
 * scontato come lo è per una prenotazione imminente).
 *
 * La data viene costruita dai pezzi e non con new Date(iso), che
 * interpreterebbe la stringa come UTC: in Italia mostrerebbe il giorno
 * prima. Le date degli slot e delle lezioni sono giorni di calendario, senza
 * fuso.
 */
export function formatLongDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]} ${year}`;
}

/** "09:00 – 09:55" da due orari Postgres (HH:MM:SS). */
export function formatTimeRange(timeFrom: string, timeTo: string): string {
  return `${timeFrom.slice(0, 5)} – ${timeTo.slice(0, 5)}`;
}

/**
 * "03/09/2026" da una data ISO (YYYY-MM-DD): il formato italiano richiesto
 * ovunque nell'app al posto dell'anno-mese-giorno grezzo del database.
 * Manipolazione di stringa, non un Date: costruire un Date qui per poi
 * riformattarlo sarebbe solo un giro più lungo per lo stesso risultato,
 * dato che i pezzi sono già nell'ordine giusto — vanno solo invertiti.
 */
export function formatShortDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * Data odierna in locale, YYYY-MM-DD. Non new Date().toISOString(): quella
 * converte in UTC, e in Italia dopo mezzanotte restituirebbe ancora il
 * giorno prima.
 */
export function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

const WEEKDAYS_SHORT = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const MONTHS_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

/**
 * Pezzi per un "foglietto di calendario" (giorno grande, mese e giorno della
 * settimana abbreviati) da una data ISO. Stessa costruzione locale di
 * formatLongDate, per lo stesso motivo del fuso.
 */
export function dateBlockParts(isoDate: string): { weekday: string; day: number; month: string } {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return {
    weekday: WEEKDAYS_SHORT[date.getDay()],
    day: date.getDate(),
    month: MONTHS_SHORT[date.getMonth()],
  };
}

/**
 * Intervallo di date compatto: "10–24 agosto 2026", "28 luglio – 3 agosto
 * 2026", o per esteso se cambia anche l'anno. Per un giorno solo, la data
 * per esteso come formatLongDate.
 */
export function formatDateRange(fromIso: string, toIso: string): string {
  if (fromIso === toIso) {
    return formatLongDate(fromIso);
  }
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  if (fy === ty && fm === tm) {
    return `${fd}–${td} ${MONTHS[tm - 1]} ${ty}`;
  }
  if (fy === ty) {
    return `${fd} ${MONTHS[fm - 1]} – ${td} ${MONTHS[tm - 1]} ${ty}`;
  }
  return `${fd} ${MONTHS[fm - 1]} ${fy} – ${td} ${MONTHS[tm - 1]} ${ty}`;
}
