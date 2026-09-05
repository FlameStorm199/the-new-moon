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
