const WEEKDAYS = [
  'domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato',
];
const MONTHS = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];

/**
 * "giovedì 3 settembre" da una data ISO (YYYY-MM-DD).
 *
 * La data viene costruita dai pezzi e non con new Date(iso), che
 * interpreterebbe la stringa come UTC: in Italia mostrerebbe il giorno
 * prima. Le date degli slot e delle lezioni sono giorni di calendario, senza
 * fuso.
 */
export function formatLongDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** "09:00 – 09:55" da due orari Postgres (HH:MM:SS). */
export function formatTimeRange(timeFrom: string, timeTo: string): string {
  return `${timeFrom.slice(0, 5)} – ${timeTo.slice(0, 5)}`;
}
