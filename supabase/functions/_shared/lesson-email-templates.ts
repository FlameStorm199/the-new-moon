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
  status: string;
  lesson_type: string;
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
  event: 'booked' | 'rescheduled' | 'cancelled' | 'reminder_24h' | 'accepted' | 'rejected',
  lesson: LessonDetail,
  previous: PreviousSlot | null
): EmailContent {
  const dogName = lesson.customer_dog_name ? ` con ${lesson.customer_dog_name}` : '';
  const isIncontro = lesson.lesson_type === 'incontro_conoscitivo';

  switch (event) {
    case 'booked':
      // Un Incontro Conoscitivo nasce 'pending' (richiede risposta
      // dell'educatore, vedi respond_incontro_conoscitivo in
      // database/28_fase2_incontro_conoscitivo_booking.sql): niente "confermata"
      // finché non lo è davvero, altrimenti l'email contraddirebbe l'app.
      if (isIncontro && lesson.status === 'pending') {
        return {
          subject: 'Richiesta di Incontro Conoscitivo ricevuta',
          html: shell(`
            <h2>Richiesta ricevuta${dogName}</h2>
            <p>Abbiamo ricevuto la tua richiesta di Incontro Conoscitivo per il <strong>${when(lesson.date, lesson.time_from, lesson.time_to)}</strong>. Ti scriviamo appena confermato dallo staff.</p>
            ${noteBlock(lesson.description)}
          `),
        };
      }
      return {
        subject: isIncontro ? 'Incontro Conoscitivo confermato' : 'Lezione confermata',
        html: shell(`
          <h2>${isIncontro ? 'Incontro Conoscitivo confermato' : 'Lezione confermata'}${dogName}</h2>
          <p>${isIncontro ? "Il tuo Incontro Conoscitivo è confermato" : 'La tua lezione è confermata'} per il <strong>${when(lesson.date, lesson.time_from, lesson.time_to)}</strong>.</p>
          ${noteBlock(lesson.description)}
        `),
      };
    case 'accepted':
      return {
        subject: 'Incontro Conoscitivo confermato',
        html: shell(`
          <h2>Incontro Conoscitivo confermato${dogName}</h2>
          <p>Il tuo Incontro Conoscitivo per il <strong>${when(lesson.date, lesson.time_from, lesson.time_to)}</strong> è confermato. Ti aspettiamo!</p>
        `),
      };
    case 'rejected':
      return {
        subject: 'Incontro Conoscitivo non confermato',
        html: shell(`
          <h2>Incontro Conoscitivo non confermato${dogName}</h2>
          <p>Purtroppo non possiamo confermare l'Incontro Conoscitivo richiesto per il <strong>${when(lesson.date, lesson.time_from, lesson.time_to)}</strong>.</p>
          ${reasonBlock(lesson.cancellation_reason)}
          <p>Contatta il centro per concordare un'altra data.</p>
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
  event: 'booked' | 'rescheduled' | 'cancelled' | 'accepted' | 'rejected',
  lesson: LessonDetail,
  previous: PreviousSlot | null
): EmailContent {
  const customer = `${lesson.customer_name} ${lesson.customer_surname}`;
  const dogName = lesson.customer_dog_name ? ` (${lesson.customer_dog_name})` : '';
  const isIncontro = lesson.lesson_type === 'incontro_conoscitivo';

  switch (event) {
    case 'booked':
      if (isIncontro && lesson.status === 'pending') {
        return {
          subject: 'Nuova richiesta di Incontro Conoscitivo',
          html: shell(`
            <h2>Nuova richiesta di Incontro Conoscitivo</h2>
            <p><strong>${customer}</strong>${dogName} ha richiesto un Incontro Conoscitivo per il <strong>${when(lesson.date, lesson.time_from, lesson.time_to)}</strong>, in attesa di conferma da "Gestione lezioni".</p>
            ${noteBlock(lesson.description)}
          `),
        };
      }
      return {
        subject: isIncontro ? 'Incontro Conoscitivo confermato' : 'Nuova prenotazione',
        html: shell(`
          <h2>${isIncontro ? 'Incontro Conoscitivo confermato' : 'Nuova prenotazione'}</h2>
          <p><strong>${customer}</strong>${dogName}${isIncontro ? ' — Incontro Conoscitivo' : ''} per il <strong>${when(lesson.date, lesson.time_from, lesson.time_to)}</strong>.</p>
          ${noteBlock(lesson.description)}
        `),
      };
    case 'accepted':
      return {
        subject: 'Incontro Conoscitivo confermato',
        html: shell(`
          <h2>Incontro Conoscitivo confermato</h2>
          <p>L'Incontro Conoscitivo di <strong>${customer}</strong>${dogName} per il <strong>${when(lesson.date, lesson.time_from, lesson.time_to)}</strong> è stato confermato.</p>
        `),
      };
    case 'rejected':
      return {
        subject: 'Incontro Conoscitivo rifiutato',
        html: shell(`
          <h2>Incontro Conoscitivo rifiutato</h2>
          <p>L'Incontro Conoscitivo di <strong>${customer}</strong>${dogName} per il <strong>${when(lesson.date, lesson.time_from, lesson.time_to)}</strong> è stato rifiutato.</p>
          ${reasonBlock(lesson.cancellation_reason)}
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
