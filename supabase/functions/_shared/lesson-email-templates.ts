// deno-lint-ignore-file no-explicit-any
// Testi delle email di lezione (prenotata/spostata/cancellata/promemoria).
// Tenuti qui, separati dalla logica di orchestrazione in index.ts, per poter
// ritoccare il testo senza toccare query o instradamento.

export interface LessonDetail {
  id: number;
  customer_name: string;
  customer_surname: string;
  customer_dog_name: string | null;
  customer_email: string | null;
  date: string;
  time_from: string;
  time_to: string;
  cancellation_reason: string | null;
  /** Nota lasciata alla prenotazione — dal cliente stesso, o dallo staff se ha prenotato per lui. */
  description: string | null;
}

export interface PreviousSlot {
  date: string;
  time_from: string;
  time_to: string;
}

function formatDateIt(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

function formatTime(time: string): string {
  return time.slice(0, 5);
}

function when(date: string, timeFrom: string, timeTo: string): string {
  return `${formatDateIt(date)} dalle ${formatTime(timeFrom)} alle ${formatTime(timeTo)}`;
}

// La motivazione è testo libero scritto dallo staff e finisce dentro l'HTML
// dell'email: va escapata, altrimenti un semplice "<" o "&" nel testo
// romperebbe il markup del messaggio.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function reasonBlock(reason: string | null): string {
  if (!reason) return '';
  return `<p style="border-left:3px solid #ddd; padding-left:0.75rem; color:#555;">
    <strong>Motivo:</strong> ${escapeHtml(reason)}
  </p>`;
}

function noteBlock(description: string | null): string {
  if (!description) return '';
  return `<p style="border-left:3px solid #ddd; padding-left:0.75rem; color:#555;">
    <strong>Nota:</strong> ${escapeHtml(description)}
  </p>`;
}

function shell(bodyHtml: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #222;">
      ${bodyHtml}
      <p style="font-size:0.8rem; color:#777; margin-top:2rem;">ASD Cinofila "La Luna Nuova"</p>
    </div>
  `;
}

export interface EmailContent {
  subject: string;
  html: string;
}

export function customerEmailFor(
  event: 'booked' | 'rescheduled' | 'cancelled' | 'reminder_24h',
  lesson: LessonDetail,
  previous: PreviousSlot | null
): EmailContent {
  const dogName = lesson.customer_dog_name ? ` con ${lesson.customer_dog_name}` : '';

  switch (event) {
    case 'booked':
      return {
        subject: 'Lezione confermata',
        html: shell(`
          <h2>Lezione confermata${dogName}</h2>
          <p>La tua lezione è confermata per il <strong>${when(lesson.date, lesson.time_from, lesson.time_to)}</strong>.</p>
          ${noteBlock(lesson.description)}
        `),
      };
    case 'rescheduled':
      return {
        subject: 'Lezione spostata',
        html: shell(`
          <h2>Lezione spostata${dogName}</h2>
          ${
            previous
              ? `<p>La tua lezione del <strong>${when(previous.date, previous.time_from, previous.time_to)}</strong> è stata spostata.</p>`
              : '<p>La tua lezione è stata spostata.</p>'
          }
          <p>Nuovo orario: <strong>${when(lesson.date, lesson.time_from, lesson.time_to)}</strong>.</p>
        `),
      };
    case 'cancelled':
      return {
        subject: 'Lezione cancellata',
        html: shell(`
          <h2>Lezione cancellata${dogName}</h2>
          <p>La lezione del <strong>${when(lesson.date, lesson.time_from, lesson.time_to)}</strong> è stata cancellata.</p>
          ${reasonBlock(lesson.cancellation_reason)}
        `),
      };
    case 'reminder_24h':
      return {
        subject: 'Promemoria: lezione domani',
        html: shell(`
          <h2>La tua lezione è domani${dogName}</h2>
          <p>Ti aspettiamo <strong>${when(lesson.date, lesson.time_from, lesson.time_to)}</strong>.</p>
        `),
      };
  }
}

export function trainerEmailFor(
  event: 'booked' | 'rescheduled' | 'cancelled',
  lesson: LessonDetail,
  previous: PreviousSlot | null
): EmailContent {
  const customer = `${lesson.customer_name} ${lesson.customer_surname}`;
  const dogName = lesson.customer_dog_name ? ` (${lesson.customer_dog_name})` : '';

  switch (event) {
    case 'booked':
      return {
        subject: 'Nuova prenotazione',
        html: shell(`
          <h2>Nuova prenotazione</h2>
          <p><strong>${customer}</strong>${dogName} ha prenotato per il <strong>${when(lesson.date, lesson.time_from, lesson.time_to)}</strong>.</p>
          ${noteBlock(lesson.description)}
        `),
      };
    case 'rescheduled':
      return {
        subject: 'Lezione spostata',
        html: shell(`
          <h2>Lezione spostata</h2>
          <p>La lezione di <strong>${customer}</strong>${dogName}
          ${
            previous
              ? `è stata spostata dal <strong>${when(previous.date, previous.time_from, previous.time_to)}</strong>`
              : 'è stata spostata'
          }
          al <strong>${when(lesson.date, lesson.time_from, lesson.time_to)}</strong>.</p>
        `),
      };
    case 'cancelled':
      return {
        subject: 'Lezione cancellata',
        html: shell(`
          <h2>Lezione cancellata</h2>
          <p>La lezione di <strong>${customer}</strong>${dogName} del <strong>${when(lesson.date, lesson.time_from, lesson.time_to)}</strong> è stata cancellata.</p>
        `),
      };
  }
}
